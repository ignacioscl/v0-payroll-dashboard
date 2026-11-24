import { ForbiddenException } from '@nestjs/common'

import type { SrsContext } from '../auth/srs-auth-context.service'
import { skipDealerRestrictionForRol } from '../shared/kpi/srs-kpi-dealer-filter'
import type { SqlRunner } from '../shared/mysql-result'

/**
 * Lo común de Billing que antes vivía dentro de Generic Invoices (plans/plan-wo-to-be-billed-v0, T2): el alcance del
 * dealer y el Lock Date. Son funciones (no un servicio inyectado) para que el spec de Generic, que arma el service
 * con dos objetos simulados, siga pasando sin tocarlo.
 */

/** Lo que hace falta leer para decidir si el dealer está en alcance. */
export type DealerScopeReader = {
  dealerRelExists(idDealer: number, idDealerProvider: number): Promise<boolean>
  restrictionDealerAllows(idUsuario: number, idDealer: number): Promise<boolean>
}

/** El dealer tiene `DEALER_REL` activo con la empresa y, si no es Admin, `RESTRICTION_DEALER_V2` lo deja. */
export async function assertDealerInScope(
  ctx: SrsContext,
  idDealer: number,
  reader: DealerScopeReader,
): Promise<void> {
  const exists = await reader.dealerRelExists(idDealer, ctx.idDealerProvider)
  if (!exists) {
    throw new ForbiddenException('Forbidden')
  }
  if (skipDealerRestrictionForRol(ctx.idRol)) return
  const allowed = await reader.restrictionDealerAllows(ctx.idUsuario, idDealer)
  if (!allowed) {
    throw new ForbiddenException('Forbidden')
  }
}

export async function dealerRelExistsSql(
  db: SqlRunner,
  idDealer: number,
  idDealerProvider: number,
): Promise<boolean> {
  const rows = await db.query(
    `SELECT 1 AS ok
     FROM DEALER_REL
     WHERE id_dealer_customer = ?
       AND id_dealer_provider = ?
       AND estado = 1
     LIMIT 1`,
    [idDealer, idDealerProvider],
  )
  return rows.length > 0
}

export async function restrictionDealerAllowsSql(
  db: SqlRunner,
  idUsuario: number,
  idDealer: number,
): Promise<boolean> {
  const rows = await db.query(`SELECT RESTRICTION_DEALER_V2(?, ?) AS ok`, [idUsuario, idDealer])
  return Number(rows[0]?.ok) === 1
}

/** El lector de alcance sobre una conexión cualquiera (la principal, la `srs` o la de una transacción). */
export function dealerScopeReader(db: SqlRunner): DealerScopeReader {
  return {
    dealerRelExists: (idDealer, idDealerProvider) => dealerRelExistsSql(db, idDealer, idDealerProvider),
    restrictionDealerAllows: (idUsuario, idDealer) => restrictionDealerAllowsSql(db, idUsuario, idDealer),
  }
}

/**
 * `CHECK_DATE_FREEZE(usuario, dealer, empresa, fecha)` (`DUMP:4721-4772`): 0 = bloqueado; 1 = libre; 2 = bloqueado pero
 * el usuario tiene el permiso de pasar el Lock Date. Legacy deja pasar 1 y 2 (`api.billing.php:74`).
 */
export async function checkDateFreezeSql(
  db: SqlRunner,
  idUsuario: number,
  idDealer: number,
  idDealerProvider: number,
  date: string,
): Promise<number> {
  const rows = await db.query(`SELECT CHECK_DATE_FREEZE(?, ?, ?, ?) AS res`, [
    idUsuario,
    idDealer,
    idDealerProvider,
    date,
  ])
  return Number(rows[0]?.res)
}

/** El texto de legacy cuando el Lock Date del dealer cubre la fecha (`api.billing.php:74`). */
export const MSG_BILLING_BLOCKED = 'The billing has been blocked'
