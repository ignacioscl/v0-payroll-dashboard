import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'

import { SrsContext } from 'src/srs/auth/srs-auth-context.service'
import { RolActivityLogAction, RolActivityLogService } from 'src/features/rol-template/service/rol-activity-log.service'
import { diffIds, toNamed } from 'src/features/rol-template/util/diff-named-ids'
import { RolAccionService } from 'src/features/srs-rol-accion/service/rol-accion.service'
import { UsuarioSrsService } from 'src/features/srs-usuario/service/usuario-srs.service'
import { SetSrsRolPermissionsDto } from '../dto/srs-rol.dto'
import { SrsRolService } from './srs-rol.service'
import { RolAccionRelService } from './rol-accion-rel.service'

export const ROL_ACCION_ROLES_LIST = 42
export const ROL_ACCION_ROLES_EDIT = 43

@Injectable()
export class SrsRolFacadeService {
  private readonly logger = new Logger(SrsRolFacadeService.name)

  constructor(
    @Inject(SrsRolService) private readonly roles: SrsRolService,
    @Inject(RolAccionRelService) private readonly rolePerms: RolAccionRelService,
    @Inject(RolAccionService) private readonly acciones: RolAccionService,
    @Inject(UsuarioSrsService) private readonly usuarios: UsuarioSrsService,
    @Inject(RolActivityLogService) private readonly activityLog: RolActivityLogService,
  ) {}

  private async assertCanView(ctx: SrsContext) {
    if (!(await this.usuarios.userHasRolAccion(ctx.idUsuario, ROL_ACCION_ROLES_LIST))) {
      throw new ForbiddenException('Forbidden')
    }
  }

  private async assertCanEdit(ctx: SrsContext) {
    if (!(await this.usuarios.userHasRolAccion(ctx.idUsuario, ROL_ACCION_ROLES_EDIT))) {
      throw new ForbiddenException('Forbidden')
    }
  }

  private async requireOwnedStandaloneRole(ctx: SrsContext, idRol: number) {
    if (!ctx.idDealerProvider || ctx.idDealerProvider < 1) {
      throw new BadRequestException('Company not found')
    }
    const role = await this.roles.findById(idRol, 'id_rol')
    if (!role) throw new NotFoundException('Role not found')
    if (Number(role.idCompaniaOwner) !== Number(ctx.idDealerProvider)) {
      throw new ForbiddenException('Forbidden')
    }
    if (Number(role.idTemplate) > 0) {
      throw new ForbiddenException('This role is based on a template. Edit permissions from Role Templates.')
    }
    return role
  }

  private async writePermissionLog(
    ctx: SrsContext,
    idRol: number,
    nombre: string,
    addedIds: number[],
    removedIds: number[],
  ) {
    if (!addedIds.length && !removedIds.length) return
    try {
      const names = await this.acciones.findNombresByIds([...addedIds, ...removedIds])
      await this.activityLog.appendForRole({
        idRol,
        idAuthor: ctx.idUsuario,
        action: RolActivityLogAction.SET_PERMISSIONS,
        summary: `Updated permissions on “${nombre}”`,
        detail: {
          added: toNamed(addedIds, names),
          removed: toNamed(removedIds, names),
          syncedRoles: [],
        },
      })
    } catch (err) {
      this.logger.warn(
        `ROL_ACTIVITY_LOG append failed (${RolActivityLogAction.SET_PERMISSIONS} role=${idRol}): ${(err as Error).message}`,
      )
    }
  }

  async listActivity(ctx: SrsContext, idRol: number) {
    await this.assertCanView(ctx)
    await this.requireOwnedStandaloneRole(ctx, idRol)
    const rows = await this.activityLog.listForRole(idRol, 200)
    const names = await this.usuarios.mapNombresByIds(rows.map((row) => row.idAuthor))
    return {
      idRol,
      results: rows.map((row) => ({
        id: row.id,
        action: row.action,
        summary: row.summary,
        detailJson: row.detailJson ?? null,
        idAuthor: row.idAuthor,
        authorNombre: names.get(row.idAuthor) ?? `#${row.idAuthor}`,
        createdAt: row.createdAt,
      })),
    }
  }

  async setPermissions(ctx: SrsContext, idRol: number, body: SetSrsRolPermissionsDto) {
    await this.assertCanEdit(ctx)
    const role = await this.requireOwnedStandaloneRole(ctx, idRol)
    const ids = Array.from(new Set((body.idsRolAccion ?? []).map(Number).filter((id) => id > 0)))
    if (!ids.length) throw new BadRequestException('idsRolAccion is required')

    const beforeIds = await this.rolePerms.listAccionIds(idRol)
    if (body.checked) {
      const actions = await this.acciones.findActionsByIds(ids)
      if (actions.length !== ids.length) throw new NotFoundException('Permission not found')
      const assigned = new Set(beforeIds)
      for (const action of actions) {
        const constraints = (action.idsActionConstraints ?? '')
          .split(',')
          .map(Number)
          .filter((id) => id > 0)
        if (constraints.some((id) => assigned.has(id))) {
          throw new BadRequestException('Before adding this permission, remove its conflicting permission.')
        }
      }
    }

    const requested = new Set(ids)
    const afterIds = body.checked
      ? Array.from(new Set([...beforeIds, ...ids]))
      : beforeIds.filter((id) => !requested.has(id))
    await this.rolePerms.replaceForRole(idRol, afterIds)

    const diff = diffIds(beforeIds, afterIds)
    await this.writePermissionLog(ctx, idRol, role.nombre, diff.addedIds, diff.removedIds)
    return { idRol, checked: body.checked, ids, cantPerm: afterIds.length }
  }
}
