import type { SrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { PunchDealerRankingRepository } from './punch-dealer-ranking.repository'

const FILTER: SrsKpiFilter = {
  idDealerProvider: 79,
  idUsuario: 10,
  dealerIds: [85, 364],
  fechaDesde: '2026-04-01',
  fechaHasta: '2026-05-31',
  filterDateDone: false,
  includeZero: false,
  skipDealerRestriction: false,
}

function mockSrs(rows: unknown[] = []) {
  // Tipado con los dos argumentos de `query`, para leer SQL y binds en `mock.calls`.
  return { query: jest.fn<Promise<unknown[]>, [sql: string, params?: unknown[]]>(async () => rows) }
}

function placeholders(sql: string): number {
  return (sql.match(/\?/g) ?? []).length
}

const METHODS = [
  'getPendingByDealer',
  'getCorrectedByDealer',
  'getPendingByEmployee',
  'getCorrectedByEmployee',
] as const

describe('PunchDealerRankingRepository', () => {
  it.each(METHODS)(
    '%s: un bind por placeholder y el provider del contexto adelante',
    async (method) => {
      for (const search of [undefined, '', '  Perez  ']) {
        for (const skipDealerRestriction of [false, true]) {
          const srs = mockSrs()
          const repo = new PunchDealerRankingRepository(srs as never)
          await repo[method](
            { ...FILTER, skipDealerRestriction },
            { errorTypes: [1, 2, 3], search, includeDeletedFixes: false },
          )
          const [sql, params] = srs.query.mock.calls[0]
          expect(placeholders(sql)).toBe(params!.length)
          // El nombre del dealer (SELECT) y después el tenant (WHERE).
          expect(params![0]).toBe(79)
          expect(params![1]).toBe(79)
          if (search?.trim()) {
            expect(params![params!.length - 1]).toBe('%Perez%')
          } else {
            expect(sql).not.toMatch(/LIKE/)
          }
          if (skipDealerRestriction) {
            expect(sql).not.toMatch(/RESTRICTION_DEALER_V2/)
          } else {
            expect(sql).toMatch(/RESTRICTION_DEALER_V2\(\?, c\.id\) = 1/)
            expect(params).toContain(10)
          }
        }
      }
    },
  )

  it('Pending: ponchadas activas y rango semiabierto sobre punch_in (DATETIME)', async () => {
    const srs = mockSrs()
    const repo = new PunchDealerRankingRepository(srs as never)
    await repo.getPendingByDealer(FILTER, { errorTypes: [1, 3], includeDeletedFixes: true })
    const [sql, params] = srs.query.mock.calls[0]
    expect(sql).toMatch(/tew\.estado = 1/)
    expect(sql).toMatch(/tew\.punch_in >= \? AND tew\.punch_in < DATE_ADD\(\?, INTERVAL 1 DAY\)/)
    // La lista de tipos va interpolada, sin binds.
    expect(sql).toMatch(/x\.err IN \(1,3\)/)
    expect(params!.slice(-2)).toEqual(['2026-04-01', '2026-05-31'])
  })

  it('Corrected: punch_date (DATE) cerrado y recorte de eliminadas según el permiso 68', async () => {
    const sin68 = mockSrs()
    await new PunchDealerRankingRepository(sin68 as never).getCorrectedByDealer(FILTER, {
      errorTypes: [2],
      includeDeletedFixes: false,
    })
    const [sqlSin68] = sin68.query.mock.calls[0]
    expect(sqlSin68).toMatch(/f\.punch_date >= \? AND f\.punch_date <= \?/)
    expect(sqlSin68).toMatch(/f\.error_type IN \(2\)/)
    expect(sqlSin68).toMatch(/AND tew\.estado = 1/)

    const con68 = mockSrs()
    await new PunchDealerRankingRepository(con68 as never).getCorrectedByDealer(FILTER, {
      errorTypes: [2],
      includeDeletedFixes: true,
    })
    expect(con68.query.mock.calls[0][0]).not.toMatch(/tew\.estado = 1/)
  })

  it('Employees: en Pending el nombre sale de ADENTRO del subselect; en Corrected, del dueño', async () => {
    const pending = mockSrs()
    await new PunchDealerRankingRepository(pending as never).getPendingByEmployee(FILTER, {
      errorTypes: [1, 2, 3],
      includeDeletedFixes: false,
    })
    expect(pending.query.mock.calls[0][0]).toMatch(/SELECT tew\.id_author, u\.nombre AS employeeName/)

    const corrected = mockSrs()
    await new PunchDealerRankingRepository(corrected as never).getCorrectedByEmployee(FILTER, {
      errorTypes: [1, 2, 3],
      includeDeletedFixes: false,
    })
    const sql = corrected.query.mock.calls[0][0]
    expect(sql).toMatch(/u\.id_usuario = f\.id_employee/)
    expect(sql).toMatch(/GROUP BY f\.id_employee, u\.nombre, f\.id_dealer/)
  })

  it('COUNT/SUM llegan como string y salen como número; punches es null en Pending', async () => {
    const raw = {
      idDealer: '85',
      dealerName: 'AutoNation Mercedes-Benz of Coconut Creek',
      total: '404',
      punches: '3',
      clockOutMissing: '1',
      breakMissing: '403',
      shift20hPlus: '0',
    }
    const opts = { errorTypes: [1, 2, 3], includeDeletedFixes: false }

    const pending = await new PunchDealerRankingRepository(mockSrs([raw]) as never).getPendingByDealer(
      FILTER,
      opts,
    )
    expect(pending).toEqual([
      {
        idDealer: 85,
        dealerName: 'AutoNation Mercedes-Benz of Coconut Creek',
        total: 404,
        punches: null,
        byType: { clockOutMissing: 1, breakMissing: 403, shift20hPlus: 0 },
      },
    ])

    const corrected = await new PunchDealerRankingRepository(
      mockSrs([raw]) as never,
    ).getCorrectedByDealer(FILTER, opts)
    expect(corrected[0].punches).toBe(3)
    expect(typeof corrected[0].total).toBe('number')

    const employees = await new PunchDealerRankingRepository(
      mockSrs([{ ...raw, idEmployee: '5429', employeeName: 'Marcos' }]) as never,
    ).getPendingByEmployee(FILTER, opts)
    expect(employees[0]).toMatchObject({ idEmployee: 5429, employeeName: 'Marcos', total: 404 })
  })
})
