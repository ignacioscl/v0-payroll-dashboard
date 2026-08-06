import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../srs.datasource'
import { SrsContext } from './srs-auth-context.service'

/** Legacy ROL_ACCION: Invoices module access (`show-rol-action-15`). */
export const ROL_ACCION_INVOICES_MODULE_ACCESS = 15

/** Legacy ROL_ACCION: District filter in billing (`show-rol-action-69`). */
export const ROL_ACCION_BILLING_DISTRICT = 69

/**
 * Port parcial de `PayrollPermissionService::userHasRolAccion` /
 * `getPermissionIds` → `loadAssignedRolAccionesForRole` → `RolDao::loadRolAccion`
 * con `idRolLeftJoin` + `existe === 1`.
 *
 * No lista todas las acciones: sólo responde si el usuario tiene UNA acción.
 */
@Injectable()
export class SrsPermissionRepository {
  /** Cache por request (mismo idUsuario + accionId). */
  private readonly cache = new Map<string, boolean>()

  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  async userHasRolAccion(ctx: SrsContext, accionId: number): Promise<boolean> {
    const id = Number(accionId)
    if (!Number.isFinite(id) || id < 1) return false

    // Paridad con isSystemAdmin PHP: Admin General (1) / Admin Company (2).
    if (ctx.idRol === 1 || ctx.idRol === 2) return true

    const key = `${ctx.idUsuario}:${id}`
    const hit = this.cache.get(key)
    if (hit !== undefined) return hit

    // Mirror RolDao::loadRolAccion with idRolLeftJoin: EXISTS on ROL_ACCION_REL
    // plus the role `tipo` filter (ra.tipo = r.tipo OR ra.tipo IS NULL).
    const rows = await this.srs.query(
      `SELECT 1 AS ok
       FROM usuarios u
       INNER JOIN ROL r ON r.id_rol = u.id_rol_system_v2
       INNER JOIN ROL_ACCION_REL rar
         ON rar.id_rol = u.id_rol_system_v2 AND rar.id_rol_accion = ?
       INNER JOIN ROL_ACCION ra ON ra.id = rar.id_rol_accion
       WHERE u.id_usuario = ?
         AND u.id_rol_system_v2 > 0
         AND (r.tipo IS NULL OR r.tipo = 0 OR ra.tipo IS NULL OR ra.tipo = r.tipo)
       LIMIT 1`,
      [id, ctx.idUsuario],
    )
    const ok = rows.length > 0
    this.cache.set(key, ok)
    return ok
  }

  async assertRolAccion(ctx: SrsContext, accionId: number): Promise<void> {
    if (!(await this.userHasRolAccion(ctx, accionId))) {
      throw new ForbiddenException('Forbidden')
    }
  }
}
