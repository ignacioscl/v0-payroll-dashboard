jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
}))

import { RoleTemplateFacadeService } from './role-template-facade.service'

describe('RoleTemplateFacadeService.setPermissions', () => {
  const ctx = { idUsuario: 7, idDealerProvider: 10 } as any
  const template = { id: 50, nombre: 'Service advisor', tipo: 1 }

  function buildFacade() {
    const templates = { findOwned: jest.fn().mockResolvedValue(template) }
    const templatePerms = {
      listAccionIds: jest.fn().mockResolvedValue([5]),
      replaceForTemplate: jest.fn().mockResolvedValue(undefined),
    }
    const activityLog = { appendForTemplate: jest.fn().mockResolvedValue(undefined) }
    const roles = {
      findNombresByIds: jest.fn().mockResolvedValue(new Map([[101, 'Advisor']])),
    }
    const rolePerms = { replaceForTemplateChildren: jest.fn().mockResolvedValue([101]) }
    const acciones = {
      findValidIdsForRoleContext: jest.fn().mockResolvedValue([12]),
      findNombresByIds: jest.fn().mockResolvedValue(
        new Map([
          [5, 'Old permission'],
          [12, 'New permission'],
        ]),
      ),
      listForRoleContext: jest.fn().mockResolvedValue([]),
    }
    const usuarios = { userHasRolAccion: jest.fn().mockResolvedValue(true) }
    const dealers = { findById: jest.fn().mockResolvedValue({}) }
    const facade = new RoleTemplateFacadeService(
      templates as any,
      templatePerms as any,
      activityLog as any,
      roles as any,
      rolePerms as any,
      acciones as any,
      usuarios as any,
      dealers as any,
    )
    return { facade, templatePerms, activityLog, roles, acciones }
  }

  it('logs named added, removed, and synced role details', async () => {
    const { facade, activityLog, acciones, roles } = buildFacade()

    await facade.setPermissions(ctx, 50, { idsRolAccion: [12] })

    expect(acciones.findNombresByIds).toHaveBeenCalledWith([12, 5])
    expect(roles.findNombresByIds).toHaveBeenCalledWith([101])
    expect(activityLog.appendForTemplate).toHaveBeenCalledWith({
      idRolTemplate: 50,
      idAuthor: 7,
      action: 'set_permissions',
      summary: 'Updated permissions on “Service advisor”',
      detail: {
        added: [{ id: 12, nombre: 'New permission' }],
        removed: [{ id: 5, nombre: 'Old permission' }],
        syncedRoles: [{ id: 101, nombre: 'Advisor' }],
      },
    })
  })

  it('does not log when permission ids are unchanged', async () => {
    const { facade, activityLog, acciones, roles, templatePerms } = buildFacade()
    acciones.findValidIdsForRoleContext.mockResolvedValue([5])
    templatePerms.listAccionIds.mockResolvedValue([5])

    await facade.setPermissions(ctx, 50, { idsRolAccion: [5] })

    expect(activityLog.appendForTemplate).not.toHaveBeenCalled()
    expect(acciones.findNombresByIds).not.toHaveBeenCalled()
    expect(roles.findNombresByIds).not.toHaveBeenCalled()
  })
})
