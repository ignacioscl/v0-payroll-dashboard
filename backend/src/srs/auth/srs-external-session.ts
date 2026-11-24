import type { SqlRunner } from '../shared/mysql-result'
import { sqlMarks } from '../shared/mysql-result'
import type { SrsContext } from './srs-auth-context.service'

/**
 * ¿La sesión es de un usuario externo? (plans/plan-wo-to-be-billed-v0, D7 y T2).
 *
 * PAREJA en PHP: `PayrollPermissionService::assertInternalSession` (`public/php/services/payroll/PayrollPermissionService.php`).
 * Las dos copias aplican la misma regla y se prueban con la misma tabla de casos (`srs-external-session.spec.ts` y el e2e
 * de permisos de `wo-to-be-billed.spec.ts` contra `wo-pdf.php`). Un cambio en una va en la otra en el mismo cambio.
 *
 * Regla: **entra solo la sesión que se puede comprobar interna; ante la duda, se deniega**. «Externo» se decide por la
 * empresa efectiva de la sesión, como la arma el login de PHP (`UsuarioService.php:92-121`), y su tipo, como lo mira
 * PHP (`PayrollDealerScopeService::isCompanyTypeCompany`). Ser Admin Company exime de los permisos de acción, no de esto.
 *
 * 1. Admin General (`usuarios.id_rol = 1`, `ctx.idRol = 1`): interna, sin más.
 * 2. Admin Company (`ctx.idRol = 2`): la empresa efectiva es la dueña del usuario (`usuarios.id_contratista_owner`,
 *    que es `ctx.idDealerProvider`).
 * 3. Con rol firmado (`ctx.idUsuarioRolrel`): tiene que ser una relación activa de ese usuario
 *    (`rr.id_usuario = usuario AND ROL.estado = 1`, `RolDao.php:248-256`); si no, se deniega. Empresa efectiva: la dueña
 *    del usuario si el rol es Admin Dealer (3) o si el rol es interno (`ROL.tipo = 1`) y la empresa de la dueña no es de
 *    tipo company; si no, el `CONTRATISTA` de `ROL.id_dealer`.
 * 4. Sin rol firmado: todas las relaciones activas del usuario, con la regla del punto 3; interna solo si todas lo son.
 *    Sin ninguna relación activa, se deniega.
 * 5. Una empresa es externa si su tipo (el de su `id_empresa` si lo tiene; si no, el propio) es 1. Si la empresa
 *    efectiva no se resuelve, se deniega.
 */

export const ROL_ADMIN_GENERAL = 1
export const ROL_ADMIN_COMPANY = 2
export const ROL_ADMIN_DEALER = 3
/** `ROL.tipo` / `RolAccion::$TIPO_ACCION_INTERNA`. */
export const ROL_TIPO_INTERNO = 1
/** `CONTRATISTA.type` / `Contratista::$TYPE_COMPANY`: la empresa del dealer (externa). */
export const CONTRATISTA_TYPE_COMPANY = 1

type RolRelRow = { idRol: number; tipo: number | null; idDealer: number | null }
type OwnerRow = { idOwner: number | null; ownerEmpresaType: number | null }

async function loadActiveRels(db: SqlRunner, idUsuario: number, idUsuarioRolrel: number | null): Promise<RolRelRow[]> {
  const params: unknown[] = [idUsuario]
  let extra = ''
  if (idUsuarioRolrel != null) {
    extra = ' AND rr.id = ?'
    params.push(idUsuarioRolrel)
  }
  const rows: Array<Record<string, unknown>> = await db.query(
    `SELECT r.id_rol AS idRol, r.tipo AS tipo, r.id_dealer AS idDealer
       FROM USUARIO_ROL_REL rr
       JOIN ROL r ON r.id_rol = rr.id_rol
      WHERE rr.id_usuario = ?
        AND r.estado = 1${extra}`,
    params,
  )
  return rows.map((r) => ({
    idRol: Number(r.idRol),
    tipo: r.tipo == null ? null : Number(r.tipo),
    idDealer: r.idDealer == null || Number(r.idDealer) <= 0 ? null : Number(r.idDealer),
  }))
}

async function loadOwner(db: SqlRunner, idUsuario: number): Promise<OwnerRow> {
  const rows: Array<Record<string, unknown>> = await db.query(
    `SELECT o.id AS idOwner, oe.type AS ownerEmpresaType
       FROM usuarios u
       LEFT JOIN CONTRATISTA o  ON o.id = u.id_contratista_owner
       LEFT JOIN CONTRATISTA oe ON oe.id = o.id_empresa
      WHERE u.id_usuario = ?
      LIMIT 1`,
    [idUsuario],
  )
  const row = rows[0]
  return {
    idOwner: row?.idOwner == null ? null : Number(row.idOwner),
    ownerEmpresaType: row?.ownerEmpresaType == null ? null : Number(row.ownerEmpresaType),
  }
}

/** El tipo efectivo de cada empresa: el de su `id_empresa` si lo tiene; si no, el propio. Sin fila = no está. */
async function loadCompanyTypes(db: SqlRunner, ids: number[]): Promise<Map<number, number | null>> {
  const out = new Map<number, number | null>()
  if (!ids.length) return out
  const rows: Array<Record<string, unknown>> = await db.query(
    `SELECT c.id AS id, COALESCE(p.type, c.type) AS typeEfectivo
       FROM CONTRATISTA c
       LEFT JOIN CONTRATISTA p ON p.id = c.id_empresa
      WHERE c.id IN (${sqlMarks(ids)})`,
    ids,
  )
  for (const r of rows) out.set(Number(r.id), r.typeEfectivo == null ? null : Number(r.typeEfectivo))
  return out
}

/** La empresa efectiva de una relación (punto 3). `null` = no se resuelve. */
export function effectiveCompanyOfRel(rel: RolRelRow, owner: OwnerRow): number | null {
  const ownerEmpresaIsCompany = owner.ownerEmpresaType === CONTRATISTA_TYPE_COMPANY
  if (rel.idRol === ROL_ADMIN_DEALER || (rel.tipo === ROL_TIPO_INTERNO && !ownerEmpresaIsCompany)) {
    return owner.idOwner
  }
  return rel.idDealer
}

function isExternalCompany(types: Map<number, number | null>, idCompany: number | null): boolean {
  if (idCompany == null || !types.has(idCompany)) return true
  return types.get(idCompany) === CONTRATISTA_TYPE_COMPANY
}

export async function isExternalSession(
  ctx: Pick<SrsContext, 'idUsuario' | 'idUsuarioRolrel' | 'idRol'>,
  db: SqlRunner,
): Promise<boolean> {
  if (ctx.idRol === ROL_ADMIN_GENERAL) return false

  if (ctx.idRol === ROL_ADMIN_COMPANY) {
    // La dueña del usuario (es `ctx.idDealerProvider` del Admin Company); se lee igual que en PHP.
    const company = (await loadOwner(db, ctx.idUsuario)).idOwner
    const types = await loadCompanyTypes(db, company == null ? [] : [company])
    return isExternalCompany(types, company)
  }

  const signed = ctx.idUsuarioRolrel != null && ctx.idUsuarioRolrel > 0 ? ctx.idUsuarioRolrel : null
  const rels = await loadActiveRels(db, ctx.idUsuario, signed)
  if (!rels.length) return true

  const owner = await loadOwner(db, ctx.idUsuario)
  const companies = rels.map((rel) => effectiveCompanyOfRel(rel, owner))
  if (companies.some((c) => c == null)) return true
  const types = await loadCompanyTypes(db, [...new Set(companies as number[])])
  return companies.some((c) => isExternalCompany(types, c))
}
