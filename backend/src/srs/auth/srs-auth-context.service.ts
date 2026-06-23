import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../srs.datasource'

/** Contexto del usuario logueado, resuelto desde la base SRS (read-only). */
export interface SrsContext {
  idUsuario: number
  idUsuarioRolrel: number | null
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
    fallbackIdDealerProvider?: number | null,
  ): Promise<SrsContext> {
    // Mirror PHP Usuario::getCompany() → contratistaOwner.id (payroll/me.php idDealerProvider).
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

    // Role-scoped login (USUARIO_ROL_REL) when owner row is absent.
    if (!idDealerProvider && idUsuarioRolrel && idUsuarioRolrel > 0) {
      const rolRows = await this.srs.query(
        `SELECT COALESCE(NULLIF(urr.id_dealer_asigned, 0), NULLIF(r.id_dealer, 0), NULLIF(r.id_compania, 0)) AS idDealerProvider
         FROM USUARIO_ROL_REL urr
         JOIN ROL r ON r.id_rol = urr.id_rol
         WHERE urr.id = ?
         LIMIT 1`,
        [idUsuarioRolrel],
      )
      idDealerProvider = Number(rolRows[0]?.idDealerProvider ?? 0)
    }

    // Admin General / Admin Company have no id_contratista_owner; PHP sets provider from session empresa.
    if (!idDealerProvider && fallbackIdDealerProvider && fallbackIdDealerProvider > 0) {
      const adminRows = await this.srs.query(
        `SELECT u.id_rol AS idRol FROM usuarios u WHERE u.id_usuario = ? LIMIT 1`,
        [idUsuario],
      )
      const idRol = Number(adminRows[0]?.idRol ?? 0)
      const isAdminScope = idRol === 1 || idRol === 2
      if (isAdminScope) {
        idDealerProvider = fallbackIdDealerProvider
      }
    }

    // IS_USER_DEALER ya existe en la base.
    const dealerRows = await this.srs.query(`SELECT IS_USER_DEALER(?) AS isDealer`, [idUsuario])
    const isUserDealer = Number(dealerRows[0]?.isDealer ?? 0) === 1

    return { idUsuario, idUsuarioRolrel, idDealerProvider, isUserDealer }
  }
}
