import { SrsRolFacadeService } from './srs-rol-facade.service'

describe('SrsRolFacadeService', () => {
  it('logs the full permission diff after adding a permission', async () => {
    const roles = {
      findById: jest.fn().mockResolvedValue({
        idRol: 10,
        nombre: 'Standalone',
        idCompaniaOwner: 5,
        idTemplate: null,
      }),
    }
    const rolePerms = {
      listAccionIds: jest.fn().mockResolvedValueOnce([1]).mockResolvedValueOnce([1, 2]),
      replaceForRole: jest.fn().mockResolvedValue(undefined),
    }
    const acciones = {
      findActionsByIds: jest.fn().mockResolvedValue([{ id: 2, idsActionConstraints: null }]),
      findNombresByIds: jest.fn().mockResolvedValue(new Map([[2, 'Permission 2']])),
    }
    const activityLog = { appendForRole: jest.fn().mockResolvedValue(undefined) }
    const usuarios = { userHasRolAccion: jest.fn().mockResolvedValue(true) }
    const service = new SrsRolFacadeService(
      roles as any,
      rolePerms as any,
      acciones as any,
      usuarios as any,
      activityLog as any,
    )

    await service.setPermissions(
      { idUsuario: 7, idDealerProvider: 5 } as any,
      10,
      { idsRolAccion: [2], checked: true },
    )

    expect(rolePerms.replaceForRole).toHaveBeenCalledWith(10, [1, 2])
    expect(activityLog.appendForRole).toHaveBeenCalledWith(
      expect.objectContaining({
        idRol: 10,
        idAuthor: 7,
        detail: { added: [{ id: 2, nombre: 'Permission 2' }], removed: [], syncedRoles: [] },
      }),
    )
  })
})
