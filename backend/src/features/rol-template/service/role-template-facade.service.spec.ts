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

describe('RoleTemplateFacadeService.assignToRole', () => {
  const ctx = { idUsuario: 7, idDealerProvider: 10 } as any

  function buildFacade(opts: {
    template?: Record<string, unknown>
    role?: Record<string, unknown> | null
    hasInternalChild?: boolean
    internalNameTaken?: boolean
    existingDealerIds?: number[]
    scopedDealers?: Record<string, unknown>[]
    rolePermIds?: number[]
    templatePermIds?: number[]
    can?: (idAccion: number) => boolean
  } = {}) {
    const template = opts.template ?? { id: 50, nombre: 'Service advisor', tipo: 1, ponderacion: 5 }
    const role =
      opts.role === undefined
        ? { idRol: 200, nombre: 'Old advisor', tipo: 1, idDealer: null, ponderacion: 3 }
        : opts.role
    const templates = { findOwned: jest.fn().mockResolvedValue(template) }
    const templatePerms = { listAccionIds: jest.fn().mockResolvedValue(opts.templatePermIds ?? [5, 12]) }
    const activityLog = {
      appendForTemplate: jest.fn().mockResolvedValue(undefined),
      appendForRole: jest.fn().mockResolvedValue(undefined),
    }
    const roles = {
      findOwnedStandalone: jest.fn().mockResolvedValue(role),
      hasInternalChild: jest.fn().mockResolvedValue(opts.hasInternalChild ?? false),
      findExistingDealerIds: jest.fn().mockResolvedValue(opts.existingDealerIds ?? []),
      assignTemplate: jest.fn().mockResolvedValue(undefined),
      existsInternalName: jest.fn().mockResolvedValue(opts.internalNameTaken ?? false),
      create: jest.fn().mockResolvedValue({ idRol: 300, nombre: 'Service advisor' }),
    }
    const rolePerms = {
      listAccionIds: jest.fn().mockResolvedValue(opts.rolePermIds ?? [5, 9]),
      replaceForRole: jest.fn().mockResolvedValue(undefined),
    }
    const acciones = {
      findNombresByIds: jest.fn().mockResolvedValue(
        new Map([
          [9, 'Old permission'],
          [12, 'New permission'],
        ]),
      ),
    }
    const can = opts.can ?? (() => true)
    const usuarios = {
      userHasRolAccion: jest.fn((_id: number, idAccion: number) => Promise.resolve(can(idAccion))),
    }
    const dealers = {
      findScopedByIds: jest.fn().mockResolvedValue(opts.scopedDealers ?? [{ id: 30, razonSocial: 'Honda' }]),
      findById: jest.fn().mockResolvedValue({ id: 10, idEmpresa: 4 }),
    }
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
    return { facade, roles, rolePerms, activityLog }
  }

  it('links an internal role: template name, level and permissions, with both logs', async () => {
    const { facade, roles, rolePerms, activityLog } = buildFacade()

    await expect(facade.assignToRole(ctx, 50, 200, { suffix: ' North ' })).resolves.toEqual({
      idTemplate: 50,
      idRol: 200,
    })

    expect(roles.existsInternalName).toHaveBeenCalledWith(10, 'Service advisor - North', 200)
    expect(roles.assignTemplate).toHaveBeenCalledWith(200, {
      idTemplate: 50,
      nombre: 'Service advisor - North',
      ponderacion: 5,
    })
    expect(rolePerms.replaceForRole).toHaveBeenCalledWith(200, [5, 12])
    expect(activityLog.appendForRole).toHaveBeenCalledWith({
      idRol: 200,
      idAuthor: 7,
      action: 'assign_template',
      summary:
        'Assigned template “Service advisor”; name “Old advisor” → “Service advisor - North”; access level 3 → 5',
      detail: {
        idTemplate: 50,
        templateNombre: 'Service advisor',
        added: [{ id: 12, nombre: 'New permission' }],
        removed: [{ id: 9, nombre: 'Old permission' }],
        before: { nombre: 'Old advisor', ponderacion: 3 },
        after: { nombre: 'Service advisor - North', ponderacion: 5 },
      },
    })
    expect(activityLog.appendForTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        idRolTemplate: 50,
        action: 'assign_template',
        summary: 'Assigned role “Old advisor” (#200) to template “Service advisor”',
      }),
    )
  })

  it('names an external role «template - dealer»', async () => {
    const { facade, roles } = buildFacade({
      template: { id: 50, nombre: 'Porter', tipo: 2, ponderacion: null },
      role: { idRol: 200, nombre: 'Porter Honda', tipo: 2, idDealer: 30, ponderacion: null },
    })

    await facade.assignToRole(ctx, 50, 200)

    expect(roles.assignTemplate).toHaveBeenCalledWith(200, {
      idTemplate: 50,
      nombre: 'Porter - Honda',
      ponderacion: null,
    })
  })

  it('logs only the assignment when nothing else changes', async () => {
    const { facade, activityLog } = buildFacade({
      role: { idRol: 200, nombre: 'Service advisor - North', tipo: 1, idDealer: null, ponderacion: 5 },
      rolePermIds: [5, 12],
    })

    await facade.assignToRole(ctx, 50, 200, { suffix: 'North' })

    expect(activityLog.appendForRole).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: 'Assigned template “Service advisor”',
        detail: expect.objectContaining({ added: [], removed: [], before: {}, after: {} }),
      }),
    )
  })

  it('assigns an internal template that already has internal roles (several per template)', async () => {
    const { facade, roles } = buildFacade({ hasInternalChild: true })

    await expect(facade.assignPreview(ctx, 50, 200)).resolves.toEqual(
      expect.objectContaining({ blocked: null, nombreAfter: 'Service advisor' }),
    )
    await facade.assignToRole(ctx, 50, 200, { suffix: 'South' })
    expect(roles.hasInternalChild).not.toHaveBeenCalled()
    expect(roles.assignTemplate).toHaveBeenCalledWith(200, expect.objectContaining({ idTemplate: 50 }))
  })

  // «<template> - <lo que escribió>» sin repetir (plans/plan-roles-padre-ttk-mi-area, agregado del 13/11).
  it('internal: without a suffix nothing is assigned', async () => {
    const { facade, roles } = buildFacade()

    await expect(facade.assignToRole(ctx, 50, 200, { suffix: '  ' })).rejects.toThrow('Name is required')
    expect(roles.assignTemplate).not.toHaveBeenCalled()
  })

  it('internal: a name taken by another internal role is rejected', async () => {
    const { facade, roles } = buildFacade({ internalNameTaken: true })

    await expect(facade.assignToRole(ctx, 50, 200, { suffix: 'North' })).rejects.toThrow(
      'A role with this name already exists',
    )
    expect(roles.assignTemplate).not.toHaveBeenCalled()
  })

  it.each([
    [
      'dealer_taken',
      {
        template: { id: 50, nombre: 'Porter', tipo: 2 },
        role: { idRol: 200, nombre: 'P', tipo: 2, idDealer: 30 },
        existingDealerIds: [30],
      },
    ],
    [
      'no_dealer',
      { template: { id: 50, nombre: 'Porter', tipo: 2 }, role: { idRol: 200, nombre: 'P', tipo: 2, idDealer: null } },
    ],
    [
      'dealer_out_of_scope',
      {
        template: { id: 50, nombre: 'Porter', tipo: 2 },
        role: { idRol: 200, nombre: 'P', tipo: 2, idDealer: 303 },
        scopedDealers: [],
      },
    ],
  ])('blocks %s: preview says why and assign writes nothing', async (reason, opts) => {
    const { facade, roles, rolePerms } = buildFacade(opts as any)

    await expect(facade.assignPreview(ctx, 50, 200)).resolves.toEqual(
      expect.objectContaining({ blocked: reason, nombreAfter: null }),
    )
    await expect(facade.assignToRole(ctx, 50, 200)).rejects.toThrow()
    expect(roles.assignTemplate).not.toHaveBeenCalled()
    expect(rolePerms.replaceForRole).not.toHaveBeenCalled()
  })

  it('rejects a type mismatch', async () => {
    const { facade, roles } = buildFacade({
      role: { idRol: 200, nombre: 'P', tipo: 2, idDealer: 30 },
    })

    await expect(facade.assignToRole(ctx, 50, 200)).rejects.toThrow('Template type does not match')
    expect(roles.assignTemplate).not.toHaveBeenCalled()
  })

  it('returns 404 when the role is not a standalone role of the company', async () => {
    const { facade } = buildFacade({ role: null })

    await expect(facade.assignPreview(ctx, 50, 200)).rejects.toThrow('Role not found')
  })

  it.each([
    ['without 144', (a: number) => a !== 144],
    ['with 144 but without 43', (a: number) => a !== 43],
  ])('forbids %s on preview and assign', async (_label, can) => {
    const { facade, roles } = buildFacade({ can })

    await expect(facade.assignPreview(ctx, 50, 200)).rejects.toThrow('Forbidden')
    await expect(facade.assignToRole(ctx, 50, 200)).rejects.toThrow('Forbidden')
    expect(roles.assignTemplate).not.toHaveBeenCalled()
  })

  // Nombre único entre los internos del detailer (plans/plan-roles-padre-ttk-mi-area, agregado del 13/11).
  it('createRoles: an internal template whose name is taken by another internal role creates nothing', async () => {
    const { facade, roles } = buildFacade({ internalNameTaken: true })

    await expect(facade.createRoles(ctx, 50, {} as any)).rejects.toThrow('A role with this name already exists')
    expect(roles.existsInternalName).toHaveBeenCalledWith(10, 'Service advisor')
    expect(roles.create).not.toHaveBeenCalled()
  })

  it('createRoles: an internal template with a free name creates the role for all dealers', async () => {
    const { facade, roles } = buildFacade()

    await expect(facade.createRoles(ctx, 50, {} as any)).resolves.toEqual({ idTemplate: 50, createdIds: [300] })
    expect(roles.create).toHaveBeenCalledWith(
      expect.objectContaining({ idDealer: null, tipo: 1, nombre: 'Service advisor' }),
    )
  })

  it('createRoles: an internal template with a suffix is named «template - suffix»', async () => {
    const { facade, roles } = buildFacade()

    await facade.createRoles(ctx, 50, { suffix: ' North ' } as any)
    expect(roles.existsInternalName).toHaveBeenCalledWith(10, 'Service advisor - North')
    expect(roles.create).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'Service advisor - North' }))
  })
})
