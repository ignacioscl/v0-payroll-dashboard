import { DataSource } from 'typeorm'

import { SrsContext } from './srs-auth-context.service'
import { ROL_ACCION_TTK_ADMIN_HOURS, SrsPermissionRepository } from './srs-permission.repository'

function ctx(partial: Partial<SrsContext> = {}): SrsContext {
  return {
    idUsuario: 76,
    idUsuarioRolrel: null,
    idRol: 5,
    idDealerProvider: 79,
    isUserDealer: false,
    ...partial,
  }
}

describe('SrsPermissionRepository.userHasRolAccion', () => {
  it('Admin Company (idRol 2) tiene todas las acciones sin consultar ROL_ACCION_REL', async () => {
    const query = jest.fn()
    const repo = new SrsPermissionRepository({ query } as unknown as DataSource)
    await expect(repo.userHasRolAccion(ctx({ idRol: 2 }), ROL_ACCION_TTK_ADMIN_HOURS)).resolves.toBe(
      true,
    )
    expect(query).not.toHaveBeenCalled()
  })

  it('Admin General (idRol 1) tiene todas las acciones sin consultar ROL_ACCION_REL', async () => {
    const query = jest.fn()
    const repo = new SrsPermissionRepository({ query } as unknown as DataSource)
    await expect(repo.userHasRolAccion(ctx({ idRol: 1 }), ROL_ACCION_TTK_ADMIN_HOURS)).resolves.toBe(
      true,
    )
    expect(query).not.toHaveBeenCalled()
  })

  it('rol granular consulta ROL_ACCION_REL por id_rol_system_v2', async () => {
    const query = jest.fn(async (): Promise<unknown[]> => [])
    const repo = new SrsPermissionRepository({ query } as unknown as DataSource)
    await expect(repo.userHasRolAccion(ctx({ idRol: 0 }), ROL_ACCION_TTK_ADMIN_HOURS)).resolves.toBe(
      false,
    )
    expect(query).toHaveBeenCalled()
    const firstCall = query.mock.calls[0] as unknown as [string, unknown[]] | undefined
    expect(String(firstCall?.[0] ?? '')).toMatch(/id_rol_system_v2/)
  })
})
