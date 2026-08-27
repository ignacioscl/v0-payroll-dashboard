import { DataSource } from 'typeorm'

import { SrsAuthContextService } from './srs-auth-context.service'
import { SRS_ROL_ADMIN_COMPANY, SRS_ROL_ADMIN_GENERAL } from '../shared/kpi/srs-kpi-dealer-filter'

type QueryFn = (sql: string, params?: unknown[]) => Promise<unknown[]>

function mockSrs(queryImpl: QueryFn): DataSource {
  return { query: jest.fn(queryImpl) } as unknown as DataSource
}

function serviceWith(queryImpl: QueryFn): { svc: SrsAuthContextService; query: jest.Mock } {
  const srs = mockSrs(queryImpl)
  return { svc: new SrsAuthContextService(srs), query: srs.query as unknown as jest.Mock }
}

/**
 * PHP Admin Company is ROL 2 via USUARIO_ROL_REL (usuarios.id_rol is NULL).
 * PHP Admin General is usuarios.id_rol = 1 and has no id_contratista_owner.
 */
describe('SrsAuthContextService.resolveContext', () => {
  it('Admin Company: id_rol NULL + USUARIO_ROL_REL 2 + owner → idRol 2 y tenant = owner (ignora session de otra compañía)', async () => {
    const { svc, query } = serviceWith(async (sql: string) => {
      if (sql.includes('u.id_rol AS idRol') && !sql.includes('id_contratista_owner')) {
        return [{ idRol: null }]
      }
      if (sql.includes('USUARIO_ROL_REL') && sql.includes('urr.id_usuario')) {
        return [{ ok: 1 }]
      }
      if (sql.includes('id_contratista_owner')) {
        return [{ idDealerProvider: 79 }]
      }
      if (sql.includes('IS_USER_DEALER')) {
        return [{ isDealer: 0 }]
      }
      return []
    })

    const ctx = await svc.resolveContext(76, null, 408)

    expect(ctx.idRol).toBe(SRS_ROL_ADMIN_COMPANY)
    expect(ctx.idDealerProvider).toBe(79)
    expect(query.mock.calls.some((c) => String(c[0]).includes('IS_USER_DEALER'))).toBe(true)
  })

  it('Admin General: id_rol 1 sin owner → tenant = session (puede cambiar de compañía)', async () => {
    const { svc } = serviceWith(async (sql: string) => {
      if (sql.includes('u.id_rol AS idRol')) {
        return [{ idRol: 1 }]
      }
      if (sql.includes('id_contratista_owner')) {
        return []
      }
      if (sql.includes('IS_USER_DEALER')) {
        return [{ isDealer: 0 }]
      }
      return []
    })

    const ctx = await svc.resolveContext(1, null, 408)

    expect(ctx.idRol).toBe(SRS_ROL_ADMIN_GENERAL)
    expect(ctx.idDealerProvider).toBe(408)
  })

  it('usuario con rol granular: no convierte a Admin Company si no hay REL 2', async () => {
    const { svc } = serviceWith(async (sql: string) => {
      if (sql.includes('u.id_rol AS idRol')) {
        return [{ idRol: 5 }]
      }
      if (sql.includes('USUARIO_ROL_REL') && sql.includes('urr.id_usuario')) {
        return []
      }
      if (sql.includes('id_contratista_owner')) {
        return [{ idDealerProvider: 79 }]
      }
      if (sql.includes('IS_USER_DEALER')) {
        return [{ isDealer: 0 }]
      }
      return []
    })

    const ctx = await svc.resolveContext(99, null, 408)

    expect(ctx.idRol).toBe(5)
    expect(ctx.idDealerProvider).toBe(79)
  })
})
