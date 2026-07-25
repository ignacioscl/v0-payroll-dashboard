import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { Transactional } from 'typeorm-transactional'

import { SrsContext } from 'src/srs/auth/srs-auth-context.service'
import { Rol } from 'src/features/srs-rol/entity/rol.entity'
import { SrsRolService } from 'src/features/srs-rol/service/srs-rol.service'
import { RolAccionRelService } from 'src/features/srs-rol/service/rol-accion-rel.service'
import { RolAccionService } from 'src/features/srs-rol-accion/service/rol-accion.service'
import { UsuarioSrsService } from 'src/features/srs-usuario/service/usuario-srs.service'
import { ContratistaService } from 'src/features/srs-contratista/service/contratista.service'
import {
  CreateRolesFromTemplateDto,
  CreateRolTemplateDto,
  RolTemplateQueryDto,
  SetRolTemplatePermissionsDto,
  UpdateRolTemplateDto,
} from '../dto/rol-template.dto'
import { RolTemplateService } from './rol-template.service'
import { RolAccionRelTemplateService } from './rol-accion-rel-template.service'
import {
  RolActivityLogAction,
  RolActivityLogService,
} from './rol-activity-log.service'
import { diffIds, toNamed } from '../util/diff-named-ids'

/** Roles Admin > Role Templates */
export const ROL_ACCION_ROLE_TEMPLATES = 144
/** Roles Admin > list (filter “based on” uses template names). */
export const ROL_ACCION_ROLES_LIST = 42

/**
 * HTTP orchestration for role templates.
 * Owns only template (+ REL + LOG) services; other tables via imported feature services.
 */
@Injectable()
export class RoleTemplateFacadeService {
  private readonly logger = new Logger(RoleTemplateFacadeService.name)

  constructor(
    @Inject(RolTemplateService) private readonly templates: RolTemplateService,
    @Inject(RolAccionRelTemplateService) private readonly templatePerms: RolAccionRelTemplateService,
    @Inject(RolActivityLogService) private readonly activityLog: RolActivityLogService,
    @Inject(SrsRolService) private readonly roles: SrsRolService,
    @Inject(RolAccionRelService) private readonly rolePerms: RolAccionRelService,
    @Inject(RolAccionService) private readonly acciones: RolAccionService,
    @Inject(UsuarioSrsService) private readonly usuarios: UsuarioSrsService,
    @Inject(ContratistaService) private readonly dealers: ContratistaService,
  ) {}

  private async assertCanManage(ctx: SrsContext): Promise<void> {
    const ok = await this.usuarios.userHasRolAccion(ctx.idUsuario, ROL_ACCION_ROLE_TEMPLATES)
    if (!ok) throw new ForbiddenException('Forbidden')
  }

  /** List templates for Roles Admin filter (42) or templates CRUD (144). */
  private async assertCanList(ctx: SrsContext): Promise<void> {
    const manage = await this.usuarios.userHasRolAccion(ctx.idUsuario, ROL_ACCION_ROLE_TEMPLATES)
    if (manage) return
    const view = await this.usuarios.userHasRolAccion(ctx.idUsuario, ROL_ACCION_ROLES_LIST)
    if (!view) throw new ForbiddenException('Forbidden')
  }

  private requireOwner(ctx: SrsContext): number {
    if (!ctx.idDealerProvider || ctx.idDealerProvider < 1) {
      throw new BadRequestException('Company not found')
    }
    return ctx.idDealerProvider
  }

  /**
   * Builds the same permission-visibility context legacy `RolesAdminService::loadPermissionsForRole`
   * uses (tipo + per-company enabled apps + ROL_ACCION_COMPANY overrides), so a template shows the
   * exact same candidate permissions a role for this company/tipo would show.
   */
  private async loadRoleContext(owner: number, tipo: number) {
    const ownerRow = await this.dealers.findById(owner)
    return {
      tipo,
      idCompanyFilter: owner,
      appValet: Number(ownerRow?.isDealerAppValet) === 1,
      moduloTV: Number(ownerRow?.hasModuleTv) === 1,
    }
  }

  private async writeLog(
    ctx: SrsContext,
    idRolTemplate: number,
    action: RolActivityLogAction,
    summary: string,
    detail?: Record<string, unknown> | null,
  ) {
    try {
      await this.activityLog.appendForTemplate({
        idRolTemplate,
        idAuthor: ctx.idUsuario,
        action,
        summary,
        detail: detail ?? null,
      })
    } catch (err) {
      // Never block the business op if logging fails (e.g. table not migrated yet).
      this.logger.warn(
        `ROL_ACTIVITY_LOG append failed (${action} template=${idRolTemplate}): ${(err as Error).message}`,
      )
    }
  }

  async list(ctx: SrsContext, query: RolTemplateQueryDto) {
    await this.assertCanList(ctx)
    const owner = this.requireOwner(ctx)
    const page = await this.templates.fetch({
      ...query,
      idCompaniaOwner: owner,
      page: query.page ?? 0,
      pageSize: query.pageSize ?? 25,
    })
    const ids = page.data.map((t) => t.id!).filter(Boolean)
    const childrenCounts = await Promise.all(
      ids.map(async (id) => [id, await this.roles.countByTemplate(id)] as const),
    )
    const permCounts = await Promise.all(
      ids.map(async (id) => [id, (await this.templatePerms.listAccionIds(id)).length] as const),
    )
    const childMap = new Map(childrenCounts)
    const permMap = new Map(permCounts)

    return {
      ...page,
      data: page.data.map((t) => ({
        ...t,
        cantRoles: childMap.get(t.id!) ?? 0,
        cantPerm: permMap.get(t.id!) ?? 0,
      })),
    }
  }

  async get(ctx: SrsContext, id: number) {
    await this.assertCanManage(ctx)
    const owner = this.requireOwner(ctx)
    const tpl = await this.templates.findOwned(id, owner)
    if (!tpl) throw new NotFoundException('Template not found')
    const cantRoles = await this.roles.countByTemplate(id)
    const cantPerm = (await this.templatePerms.listAccionIds(id)).length
    return { ...tpl, cantRoles, cantPerm }
  }

  async listActivity(ctx: SrsContext, id: number) {
    await this.assertCanManage(ctx)
    const owner = this.requireOwner(ctx)
    const tpl = await this.templates.findOwned(id, owner)
    if (!tpl) throw new NotFoundException('Template not found')
    const rows = await this.activityLog.listForTemplate(id, 200)
    const names = await this.usuarios.mapNombresByIds(rows.map((r) => r.idAuthor))
    return {
      idTemplate: id,
      results: rows.map((r) => ({
        id: r.id,
        action: r.action,
        summary: r.summary,
        detailJson: r.detailJson ?? null,
        idAuthor: r.idAuthor,
        authorNombre: names.get(r.idAuthor) ?? `#${r.idAuthor}`,
        createdAt: r.createdAt,
      })),
    }
  }

  @Transactional()
  async create(ctx: SrsContext, body: CreateRolTemplateDto) {
    await this.assertCanManage(ctx)
    const owner = this.requireOwner(ctx)
    const nombre = body.nombre.trim()
    if (!nombre) throw new BadRequestException('Name is required')
    const created = await this.templates.create({
      idCompaniaOwner: owner,
      tipo: body.tipo,
      nombre,
      ponderacion: body.ponderacion ?? null,
      estado: 1,
    })
    await this.writeLog(ctx, created.id!, RolActivityLogAction.CREATE, `Created template “${nombre}”`, {
      tipo: body.tipo,
      ponderacion: body.ponderacion ?? null,
    })
    return this.get(ctx, created.id!)
  }

  @Transactional()
  async update(ctx: SrsContext, id: number, body: UpdateRolTemplateDto) {
    await this.assertCanManage(ctx)
    const owner = this.requireOwner(ctx)
    const tpl = await this.templates.findOwned(id, owner)
    if (!tpl) throw new NotFoundException('Template not found')
    const { tipo: _ignore, ...rest } = body as UpdateRolTemplateDto & { tipo?: number }
    const before = {
      nombre: tpl.nombre,
      ponderacion: tpl.ponderacion ?? null,
      estado: tpl.estado,
    }
    const patch = {
      ...(rest.nombre !== undefined ? { nombre: rest.nombre.trim() } : {}),
      ...(rest.ponderacion !== undefined ? { ponderacion: rest.ponderacion } : {}),
      ...(rest.estado !== undefined ? { estado: rest.estado } : {}),
    }
    await this.templates.updateById(id, patch)

    let action: RolActivityLogAction = RolActivityLogAction.UPDATE
    let summary = `Updated template “${tpl.nombre}”`
    if (rest.estado !== undefined && rest.estado !== before.estado) {
      action =
        rest.estado === 1 ? RolActivityLogAction.ACTIVATE : RolActivityLogAction.INACTIVATE
      summary =
        rest.estado === 1
          ? `Activated template “${tpl.nombre}”`
          : `Set template “${tpl.nombre}” inactive`
    }
    await this.writeLog(ctx, id, action, summary, { before, after: { ...before, ...patch } })
    return this.get(ctx, id)
  }

  @Transactional()
  async remove(ctx: SrsContext, id: number) {
    await this.assertCanManage(ctx)
    const owner = this.requireOwner(ctx)
    const tpl = await this.templates.findOwned(id, owner)
    if (!tpl) throw new NotFoundException('Template not found')
    const children = await this.roles.countByTemplate(id)
    if (children > 0) {
      throw new BadRequestException(
        `Cannot delete this template: ${children} role(s) are still based on it. Delete those roles first.`,
      )
    }
    await this.writeLog(ctx, id, RolActivityLogAction.DELETE, `Deleted template “${tpl.nombre}”`, {
      nombre: tpl.nombre,
      tipo: tpl.tipo,
    })
    await this.templates.delete(id)
    return { id }
  }

  async listPermissions(ctx: SrsContext, id: number) {
    await this.assertCanManage(ctx)
    const owner = this.requireOwner(ctx)
    const tpl = await this.templates.findOwned(id, owner)
    if (!tpl) throw new NotFoundException('Template not found')
    const context = await this.loadRoleContext(owner, Number(tpl.tipo))
    const all = await this.acciones.listForRoleContext(context)
    const assigned = new Set(await this.templatePerms.listAccionIds(id))
    return {
      idTemplate: id,
      templateNombre: tpl.nombre,
      tipo: tpl.tipo,
      permissions: all.map((ra) => ({
        id: ra.id!,
        nombre: ra.nombreAccion,
        description: ra.description ?? null,
        assigned: assigned.has(ra.id!),
      })),
    }
  }

  @Transactional()
  async setPermissions(ctx: SrsContext, id: number, body: SetRolTemplatePermissionsDto) {
    await this.assertCanManage(ctx)
    const owner = this.requireOwner(ctx)
    const tpl = await this.templates.findOwned(id, owner)
    if (!tpl) throw new NotFoundException('Template not found')

    const rawIds = Array.from(
      new Set((body.idsRolAccion ?? []).map(Number).filter((n) => n > 0)),
    )
    const context = await this.loadRoleContext(owner, Number(tpl.tipo))
    const valid = await this.acciones.findValidIdsForRoleContext(rawIds, context)
    if (valid.length !== rawIds.length) {
      throw new BadRequestException(
        'One or more permissions are invalid for this template (not applicable to this company/type).',
      )
    }

    const beforeIds = await this.templatePerms.listAccionIds(id)
    await this.templatePerms.replaceForTemplate(id, valid)
    const syncedRoleIds = await this.rolePerms.replaceForTemplateChildren(id, valid)
    this.logger.log(
      `Template ${id}: permissions replaced (${valid.length}); synced ${syncedRoleIds.length} child role(s): [${syncedRoleIds.join(', ')}]`,
    )
    const diff = diffIds(beforeIds, valid)
    if (diff.addedIds.length || diff.removedIds.length) {
      const [permissionNames, roleNames] = await Promise.all([
        this.acciones.findNombresByIds([...diff.addedIds, ...diff.removedIds]),
        this.roles.findNombresByIds(syncedRoleIds),
      ])
      await this.writeLog(
        ctx,
        id,
        RolActivityLogAction.SET_PERMISSIONS,
        `Updated permissions on “${tpl.nombre}”`,
        {
          added: toNamed(diff.addedIds, permissionNames),
          removed: toNamed(diff.removedIds, permissionNames),
          syncedRoles: toNamed(syncedRoleIds, roleNames),
        },
      )
    }
    const listed = await this.listPermissions(ctx, id)
    return { ...listed, syncedRoleIds, syncedCount: syncedRoleIds.length }
  }

  async listRoles(ctx: SrsContext, id: number) {
    await this.assertCanManage(ctx)
    const owner = this.requireOwner(ctx)
    const tpl = await this.templates.findOwned(id, owner)
    if (!tpl) throw new NotFoundException('Template not found')
    const roles = await this.roles.findChildren(id)
    const counts = await this.rolePerms.countByRoleIds(roles.map((r) => r.idRol))
    return {
      idTemplate: id,
      results: roles.map((r) => ({
        id: r.idRol,
        nombre: r.nombre,
        tipo: r.tipo,
        estado: r.estado,
        idDealer: r.idDealer ?? null,
        dealerNombre: r.dealer?.razonSocial ?? null,
        cantPerm: counts.get(r.idRol) ?? 0,
      })),
    }
  }

  @Transactional()
  async createRoles(ctx: SrsContext, id: number, body: CreateRolesFromTemplateDto) {
    await this.assertCanManage(ctx)
    const owner = this.requireOwner(ctx)
    const tpl = await this.templates.findOwned(id, owner)
    if (!tpl) throw new NotFoundException('Template not found')

    const permissionIds = await this.templatePerms.listAccionIds(id)
    const ponderacion = tpl.ponderacion ?? null
    const ownerRow = await this.dealers.findById(owner)
    const idCompania =
      ownerRow?.idEmpresa && ownerRow.idEmpresa > 0 ? ownerRow.idEmpresa : owner

    if (Number(tpl.tipo) === 1) {
      if (await this.roles.hasInternalChild(id)) {
        throw new BadRequestException('An internal role based on this template already exists.')
      }
      const created = await this.roles.create({
        idDepartment: null,
        idDealer: null,
        idCompania,
        idCompaniaOrigen: owner,
        idCompaniaOwner: owner,
        idTemplate: id,
        tipo: 1,
        nombre: tpl.nombre,
        ponderacion,
        estado: 1,
      } as Partial<Rol>)
      await this.rolePerms.replaceForRole(created.idRol, permissionIds)
      await this.writeLog(
        ctx,
        id,
        RolActivityLogAction.CREATE_ROLES,
        `Created internal role #${created.idRol} from “${tpl.nombre}”`,
        { createdIds: [created.idRol] },
      )
      return { idTemplate: id, createdIds: [created.idRol] }
    }

    const idDealers = Array.from(
      new Set((body.idDealers ?? []).map(Number).filter((n) => n > 0)),
    )
    if (!idDealers.length) {
      throw new BadRequestException('idDealers is required for external templates')
    }

    const existing = await this.roles.findExistingDealerIds(id, idDealers)
    if (existing.length) {
      throw new BadRequestException(
        `Role(s) already exist for this template and dealer(s): ${existing.join(', ')}`,
      )
    }

    const dealerRows = await this.dealers.findScopedByIds(idDealers, owner)
    if (dealerRows.length !== idDealers.length) {
      const found = new Set(dealerRows.map((d) => Number(d.id)))
      const missing = idDealers.filter((id) => !found.has(id))
      throw new BadRequestException(
        `One or more dealers are invalid or out of scope: ${missing.join(', ')}`,
      )
    }
    const scoped = dealerRows

    const createdIds: number[] = []
    for (const d of scoped) {
      const created = await this.roles.create({
        idDepartment: null,
        idDealer: d.id,
        idCompania: d.idEmpresa && d.idEmpresa > 0 ? d.idEmpresa : idCompania,
        idCompaniaOrigen: owner,
        idCompaniaOwner: owner,
        idTemplate: id,
        tipo: 2,
        nombre: `${tpl.nombre} - ${d.razonSocial}`.slice(0, 64),
        ponderacion,
        estado: 1,
      } as Partial<Rol>)
      await this.rolePerms.replaceForRole(created.idRol, permissionIds)
      createdIds.push(created.idRol)
    }
    await this.writeLog(
      ctx,
      id,
      RolActivityLogAction.CREATE_ROLES,
      `Created ${createdIds.length} external role(s) from “${tpl.nombre}”`,
      { createdIds, idDealers },
    )
    return { idTemplate: id, createdIds }
  }

  @Transactional()
  async deleteRole(ctx: SrsContext, idTemplate: number, idRol: number) {
    await this.assertCanManage(ctx)
    const owner = this.requireOwner(ctx)
    const tpl = await this.templates.findOwned(idTemplate, owner)
    if (!tpl) throw new NotFoundException('Template not found')
    const child = await this.roles.findOwnedChild(idTemplate, idRol, owner)
    if (!child) throw new NotFoundException('Role not found for this template')

    const userCount = await this.roles.countUsersAssigned(idRol)
    if (userCount > 0) {
      throw new BadRequestException(
        `Cannot delete this role: it is still assigned to ${userCount} user(s).`,
      )
    }

    await this.rolePerms.replaceForRole(idRol, [])
    await this.roles.deleteByIdRol(idRol)
    await this.writeLog(
      ctx,
      idTemplate,
      RolActivityLogAction.DELETE_ROLE,
      `Deleted role “${child.nombre}” (#${idRol}) from template “${tpl.nombre}”`,
      { idRol, rolNombre: child.nombre },
    )
    return { id: idRol }
  }

  @Transactional()
  async setRoleEstado(ctx: SrsContext, idTemplate: number, idRol: number, estado: number) {
    await this.assertCanManage(ctx)
    if (estado !== 0 && estado !== 1) throw new BadRequestException('Invalid estado')
    const owner = this.requireOwner(ctx)
    const tpl = await this.templates.findOwned(idTemplate, owner)
    if (!tpl) throw new NotFoundException('Template not found')
    const child = await this.roles.findOwnedChild(idTemplate, idRol, owner)
    if (!child) throw new NotFoundException('Role not found for this template')
    await this.roles.updateEstado(idRol, estado)
    await this.writeLog(
      ctx,
      idTemplate,
      RolActivityLogAction.SET_ROLE_ESTADO,
      estado === 1
        ? `Activated role “${child.nombre}” (#${idRol})`
        : `Set role “${child.nombre}” (#${idRol}) inactive`,
      { idRol, estado },
    )
    return { id: idRol, estado }
  }
}
