import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../srs.datasource'
import { SRS_ROL_ADMIN_COMPANY, SRS_ROL_ADMIN_GENERAL } from '../shared/kpi/srs-kpi-dealer-filter'

/** Contexto del usuario logueado, resuelto desde la base SRS (read-only). */
export interface SrsContext {
  idUsuario: number
  idUsuarioRolrel: number | null
  /**
   * Rol efectivo (paridad PHP `$usr->rol` post-login), no sólo `usuarios.id_rol`.
   * 1 = Admin General (todas las compañías vía session, sin `id_contratista_owner`).
   * 2 = Admin Company (todos los permisos dentro de su `id_contratista_owner`).
   * Admin Company real suele tener `usuarios.id_rol` NULL y `USUARIO_ROL_REL.id_rol = 2`.
   */
  idRol: number
  /** Provider (CONTRATISTA) — tenant para filtrar queries KPI; mismo id que PHP `getCompany()->getId()`. */
  idDealerProvider: number
  /** El usuario es de tipo dealer (define cómo aplica RESTRICTION_DEALER_V2). */
  isUserDealer: boolean
}

/**
 * Resuelve provider + tipo del usuario logueado. NO reimplementa la lógica de
 * permisos: para restringir dealers se usa la función SQL RESTRICTION_DEALER_V2,
 * que ya vive en la base.
 */
@Injectable()
export class SrsAuthContextService {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  async resolveContext(
    idUsuario: number,
    idUsuarioRolrel: number | null,
    /**
     * Only Admin General (`usuarios.id_rol` = 1) without `id_contratista_owner`.
     * Admin Company tenant is always the owner — never this header (would switch company).
     * Must come from Next session via proxy header — never from client query.
     */
    sessionIdDealerProvider?: number | null,
  ): Promise<SrsContext> {
    const rolRows = await this.srs.query(
      `SELECT u.id_rol AS idRol FROM usuarios u WHERE u.id_usuario = ? LIMIT 1`,
      [idUsuario],
    )
    const rawIdRol = Number(rolRows[0]?.idRol ?? 0)

    // PHP: Admin General = usuarios.id_rol 1. Admin Company = ROL 2 on USUARIO_ROL_REL
    // (login overwrites `$usr->rol`); usuarios.id_rol is NULL on almost all real rows.
    let idRol = rawIdRol
    if (rawIdRol !== SRS_ROL_ADMIN_GENERAL && rawIdRol !== SRS_ROL_ADMIN_COMPANY) {
      const companyAdminRows = await this.srs.query(
        `SELECT 1 AS ok
         FROM USUARIO_ROL_REL urr
         WHERE urr.id_usuario = ?
           AND urr.id_rol = ?
         LIMIT 1`,
        [idUsuario, SRS_ROL_ADMIN_COMPANY],
      )
      if (companyAdminRows.length > 0) {
        idRol = SRS_ROL_ADMIN_COMPANY
      }
    }

    // Mirror PHP Usuario::getCompany() → contratistaOwner.id (payroll/me.php idDealerProvider).
    // Admin Company: always this. Admin General: no owner, falls through to session.
    const ownerRows = await this.srs.query(
      `SELECT c.id AS idDealerProvider
       FROM usuarios u
       JOIN CONTRATISTA c ON c.id = u.id_contratista_owner
       WHERE u.id_usuario = ?
         AND u.id_contratista_owner > 0
       LIMIT 1`,
      [idUsuario],
    )
    let idDealerProvider = Number(ownerRows[0]?.idDealerProvider ?? 0)

    // Role-scoped login (USUARIO_ROL_REL) when owner row is absent. Not Admin Company.
    if (!idDealerProvider && idUsuarioRolrel && idUsuarioRolrel > 0) {
      const scopeRows = await this.srs.query(
        `SELECT COALESCE(NULLIF(urr.id_dealer_asigned, 0), NULLIF(r.id_dealer, 0), NULLIF(r.id_compania, 0)) AS idDealerProvider
         FROM USUARIO_ROL_REL urr
         JOIN ROL r ON r.id_rol = urr.id_rol
         WHERE urr.id = ?
         LIMIT 1`,
        [idUsuarioRolrel],
      )
      idDealerProvider = Number(scopeRows[0]?.idDealerProvider ?? 0)
    }

    // Admin General only: PHP session empresa (no contratista_owner). Never Admin Company.
    if (!idDealerProvider && sessionIdDealerProvider && sessionIdDealerProvider > 0) {
      if (rawIdRol === SRS_ROL_ADMIN_GENERAL) {
        idDealerProvider = sessionIdDealerProvider
      }
    }

    // IS_USER_DEALER ya existe en la base.
    const dealerRows = await this.srs.query(`SELECT IS_USER_DEALER(?) AS isDealer`, [idUsuario])
    const isUserDealer = Number(dealerRows[0]?.isDealer ?? 0) === 1

    return { idUsuario, idUsuarioRolrel, idRol, idDealerProvider, isUserDealer }
  }
}
