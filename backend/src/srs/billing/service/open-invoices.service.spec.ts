/**
 * §7.3 and §7.5 of plans/plan-reporte-javier/PLAN.md, with the repositories mocked: permission, «As of»,
 * the snapshot saved before the Excel (no snapshot, no Excel), the Excel (Summary = Invoices = screen,
 * Report Info), and the comparison cut to the dealers of the user, with the dealer at 0 of review 2.
 */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import ExcelJS from 'exceljs'
import { PassThrough } from 'stream'

import type { SrsContext } from '../../auth/srs-auth-context.service'
import { buildDealerTotals } from '../../../features/open-invoice-snapshot/service/open-invoice-snapshot.service'
import type { OpenInvoiceSnapshotFull } from '../../../features/open-invoice-snapshot/dto/open-invoice-snapshot.dto'
import { isValidOpenInvoicesAsOf } from '../dto/open-invoices.dto'
import type { OpenInvoiceSqlRow } from '../open-invoice-aging'
import { openInvoicesExportLabels } from '../open-invoices-export-labels'
import { OpenInvoicesService } from './open-invoices.service'
import { OpenInvoicesCompareService } from './open-invoices-compare.service'

/** The report runs on Thursday 10/01/2026, 11:00 AM in New York, like Tammy's sheet of 09/27 (§1.3). */
beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'queueMicrotask', 'performance', 'hrtime'] })
  jest.setSystemTime(new Date('2026-10-01T15:00:00Z'))
})
afterEach(() => jest.useRealTimers())

const ADMIN: SrsContext = { idUsuario: 76, idUsuarioRolrel: null, idRol: 2, idDealerProvider: 79, isUserDealer: false, isActive: true }
const RESTRICTED: SrsContext = { ...ADMIN, idUsuario: 4972, idRol: 5 }

function sqlRow(over: Partial<OpenInvoiceSqlRow>): OpenInvoiceSqlRow {
  return {
    sid: 1,
    fullNro: 'A-1',
    dealerId: 10,
    statementType: 1,
    createdYmd: '2026-09-20',
    dateFromYmd: null,
    dateToYmd: null,
    deptId: 3,
    deptName: 'Sales',
    puestoKey: null,
    services: 'PDI',
    amount: 100,
    ...over,
  }
}

type Mocks = ReturnType<typeof makeMocks>

function makeMocks(rows: OpenInvoiceSqlRow[]) {
  const names = new Map([[10, 'Dealer A'], [20, 'Dealer B']])
  const repository = {
    openRows: jest.fn(async (_f: { dealerIds: number[] }) => rows),
    dueOnByDealer: jest.fn(async () => new Map<number, number | null>()),
    dealerNames: jest.fn(async (_p: number, ids: readonly number[]) => new Map(ids.map((id) => [id, names.get(id) ?? String(id)]))),
    removedDealersOfProvider: jest.fn(async () => []),
    activeBillingIdsBySid: jest.fn(async () => new Map([[1, [500]]])),
  }
  const permissions = { assertRolAccion: jest.fn(async () => undefined) }
  const payroll = { activeDealerIds: jest.fn(async () => [10, 20]) }
  const snapshots = {
    save: jest.fn(async () => 123),
    listByProvider: jest.fn(),
    listHeadersByProvider: jest.fn(),
    findOneByProvider: jest.fn(),
  }
  // resolveLocale, loadUserName and countRequestedDealersInScope go through srs.query.
  const srs = {
    query: jest.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('type_nav_template')) return [{ type_nav_template: 1 }]
      if (sql.includes('FROM usuarios')) return [{ nombre: `User ${params[0]}` }]
      if (sql.includes('COUNT(DISTINCT dr.id_dealer_customer)')) return [{ n: params.length - 1 - (sql.includes('RESTRICTION') ? 1 : 0) }]
      return []
    }),
  }
  const service = new OpenInvoicesService(repository as never, permissions as never, payroll as never, snapshots as never, srs as never)
  return { repository, permissions, payroll, snapshots, srs, service }
}

async function exportToWorkbook(m: Mocks, ctx: SrsContext, query: Record<string, unknown>): Promise<ExcelJS.Workbook> {
  const stream = new PassThrough()
  const chunks: Buffer[] = []
  stream.on('data', (c: Buffer) => chunks.push(c))
  const res = Object.assign(stream, { setHeader: jest.fn() })
  await m.service.export(ctx, query as never, res as never)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.concat(chunks) as never)
  return wb
}

describe('As of', () => {
  const now = new Date('2026-10-01T15:00:00Z')
  it('a Sunday not in the future passes; anything else is 400', () => {
    expect(isValidOpenInvoicesAsOf('2026-09-27', now)).toBe(true)
    expect(isValidOpenInvoicesAsOf('2026-09-28', now)).toBe(false) // Monday
    expect(isValidOpenInvoicesAsOf('2026-10-04', now)).toBe(false) // future Sunday
    expect(isValidOpenInvoicesAsOf('2026-02-30', now)).toBe(false)
    expect(isValidOpenInvoicesAsOf('27/09/2026', now)).toBe(false)
  })

  it('the endpoint answers 400 with the field', async () => {
    const m = makeMocks([])
    await expect(m.service.getReport(ADMIN, { asOf: '2026-09-28', idDealer: '10' } as never)).rejects.toBeInstanceOf(BadRequestException)
    expect(m.repository.openRows).not.toHaveBeenCalled()
  })
})

describe('permission «Reports > Due On Billing» (123)', () => {
  it('without it: 403 and no query', async () => {
    const m = makeMocks([])
    m.permissions.assertRolAccion.mockRejectedValueOnce(new ForbiddenException('Forbidden'))
    await expect(m.service.getReport(RESTRICTED, { asOf: '2026-09-27', idDealer: '10' } as never)).rejects.toBeInstanceOf(ForbiddenException)
    expect(m.permissions.assertRolAccion).toHaveBeenCalledWith(RESTRICTED, 123)
    expect(m.repository.openRows).not.toHaveBeenCalled()
  })
})

describe('screen', () => {
  it('one row per dealer × department with the provider of the session; the removed switch is ignored for restricted users', async () => {
    const m = makeMocks([sqlRow({ sid: 1, amount: 100 }), sqlRow({ sid: 2, dealerId: 20, amount: 50.25, createdYmd: '2026-06-01' })])
    const dto = await m.service.getReport(RESTRICTED, { asOf: '2026-09-27', idDealer: '10,20', includeRemovedDealers: true } as never)
    const f = m.repository.openRows.mock.calls[0][0] as unknown as Record<string, unknown>
    expect(f).toMatchObject({ idDealerProvider: 79, idUsuario: 4972, skipDealerRestriction: false, includeRemovedDealers: false, asOf: '2026-09-27' })
    expect(dto.rows.map((r) => [r.dealer, r.department, r.total])).toEqual([
      ['Dealer A', 'Sales', 100],
      ['Dealer B', 'Sales', 50.25],
    ])
    expect(dto.totals.total).toBe(150.25)
  })
})

describe('export', () => {
  const rows = [
    sqlRow({ sid: 1, amount: 100.1 }),
    sqlRow({ sid: 1, deptId: 4, deptName: 'Service', amount: 0.2 }),
    sqlRow({ sid: 2, dealerId: 20, statementType: 5, deptId: 0, deptName: null, puestoKey: 'P:Valet', amount: 40, createdYmd: '2026-09-28', dateFromYmd: '2026-09-21', dateToYmd: '2026-09-27' }),
  ]

  it('saves the snapshot first, with every row of the Invoices sheet and the dealers of the engine', async () => {
    const m = makeMocks(rows)
    await exportToWorkbook(m, ADMIN, { asOf: '2026-09-27', idDealer: '10,20' })
    expect(m.snapshots.save).toHaveBeenCalledTimes(1)
    const saved = (m.snapshots.save.mock.calls[0] as unknown[])[0] as Record<string, any>
    expect(saved.dealerIds).toBeNull() // All: the two active dealers of the company
    expect(saved.engineDealerIds).toEqual([10, 20])
    expect(saved.rows).toHaveLength(3)
    expect(saved.rows[2]).toMatchObject({ department: 'Timesheets · Valet', departmentKey: 't:P:Valet', bucket: 'current' })
    expect(saved.payments).toEqual({ '1': [500] })
  })

  it('no snapshot, no Excel', async () => {
    const m = makeMocks(rows)
    m.snapshots.save.mockRejectedValueOnce(new Error('INSERT command denied'))
    const res = { setHeader: jest.fn(), write: jest.fn(), end: jest.fn() }
    await expect(m.service.export(ADMIN, { asOf: '2026-09-27', idDealer: '10,20' } as never, res as never)).rejects.toThrow()
    expect(res.setHeader).not.toHaveBeenCalled()
  })

  it('a dealer out of the scope of the user: 403 before running', async () => {
    const m = makeMocks(rows)
    m.srs.query.mockImplementation(async (sql: string) => (sql.includes('COUNT(DISTINCT') ? [{ n: 1 }] : []))
    await expect(m.service.export(RESTRICTED, { asOf: '2026-09-27', idDealer: '10,20' } as never, {} as never)).rejects.toBeInstanceOf(ForbiddenException)
    expect(m.snapshots.save).not.toHaveBeenCalled()
  })

  it('Report Info first with the snapshot and the 8 rules; Invoices = Summary = screen to the cent', async () => {
    const m = makeMocks(rows)
    const wb = await exportToWorkbook(m, ADMIN, { asOf: '2026-09-27', idDealer: '10,20' })
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Report Info', 'Summary', 'Invoices'])
    const info = wb.getWorksheet('Report Info')!
    const infoRows = info.getSheetValues().slice(2).map((r) => (r as unknown[]).slice(1, 3))
    expect(infoRows).toContainEqual(['Snapshot', '#123'])
    expect(infoRows).toContainEqual(['As of', '09/27/2026'])
    expect(infoRows).toContainEqual(['Dealers', 'All'])
    const labels = openInvoicesExportLabels('en')
    for (const line of labels.rules) expect(infoRows.some((r) => r[1] === line)).toBe(true)

    const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100)
    const inv = wb.getWorksheet('Invoices')!
    let invoicesTotal = 0
    inv.eachRow((r, n) => {
      if (n > 2) invoicesTotal += cents(r.getCell(13).value)
    })
    const sum = wb.getWorksheet('Summary')!
    const last = sum.getRow(sum.rowCount)
    expect(last.getCell(1).value).toBe('TOTAL')
    const screen = await m.service.getReport(ADMIN, { asOf: '2026-09-27', idDealer: '10,20' } as never)
    expect(invoicesTotal).toBe(cents(last.getCell(8).value))
    expect(invoicesTotal).toBe(cents(screen.totals.total))
    // Dates as native Excel dates (rule export-date-format).
    expect(inv.getRow(5).getCell(4).value).toBeInstanceOf(Date)
  })
})

describe('buildDealerTotals', () => {
  it('every dealer of the engine, also at 0; a removed dealer with rows is added', () => {
    expect(buildDealerTotals([10, 20], [{ dealerId: 10, amount: 100 }, { dealerId: 99, amount: 5.5 }])).toEqual({
      '10': { total: 100, rows: 1 },
      '20': { total: 0, rows: 0 },
      '99': { total: 5.5, rows: 1 },
    })
  })
})

describe('comparison cut to the dealers of the user (§3.6 step 3, §7.5)', () => {
  // Snapshot of A (10) + B (20): A = 100.00, B without rows (at 0).
  const snapshot: OpenInvoiceSnapshotFull = {
    id: 7,
    idDealerProvider: 79,
    idUsuario: 76,
    generatedAt: '2026-10-01 14:12:00',
    asOf: '2026-09-27',
    dealerIds: null,
    includeRemoved: false,
    total: 100,
    rowCount: 1,
    dealerTotals: buildDealerTotals([10, 20], [{ dealerId: 10, amount: 100 }]),
    rows: [
      { sid: 1, fullNro: 'A-1', dealerId: 10, statementType: 1, createdYmd: '2026-09-20', dateToYmd: null, department: 'Sales', departmentKey: 'd:3', days: 11, termDays: 15, bucket: 'current', amount: 100 },
    ],
    payments: { '1': [] },
  }
  // Today: A unchanged; a Generic of B for 640.00 with DATE TO by the As of, created after the snapshot.
  const today = [
    sqlRow({ sid: 1, amount: 100, createdYmd: '2026-09-20' }),
    sqlRow({ sid: 2, dealerId: 20, statementType: 6, deptId: 0, deptName: null, puestoKey: 'G', amount: 640, createdYmd: '2026-10-02', dateFromYmd: '2026-09-21', dateToYmd: '2026-09-27' }),
  ]

  function compareService(m: Mocks, visible: number[]) {
    m.snapshots.findOneByProvider.mockImplementation(async (id: number, prov: number) => (id === 7 && prov === 79 ? snapshot : null))
    m.snapshots.listHeadersByProvider.mockResolvedValue([snapshot])
    m.snapshots.listByProvider.mockResolvedValue({ rows: [snapshot], total: 1 })
    const compareRepo = {
      dealersVisibleToUser: jest.fn(async (_u: number, ids: readonly number[]) => ids.filter((id) => visible.includes(id))),
      factsBySid: jest.fn(async () => new Map([[2, { estado: 1, fechaCreate: '2026-10-02 09:00:00', payments: [] }]])),
    }
    // The comparison runs the report with the same mocked engine; each run returns the rows of its dealers.
    m.repository.openRows.mockImplementation(async (f: { dealerIds: number[] }) => today.filter((r) => f.dealerIds.includes(r.dealerId)))
    return {
      compareRepo,
      service: new OpenInvoicesCompareService(m.service, m.repository as never, compareRepo as never, m.snapshots as never, m.srs as never),
    }
  }

  it('Admin Company: the whole snapshot; today 740.00, Difference +640.00 with reason 4', async () => {
    const m = makeMocks([])
    const { service } = compareService(m, [])
    const dto = await service.compare(ADMIN, 7)
    expect(dto.totals).toEqual({ snapshot: 100, today: 740, difference: 640 })
    expect(dto.rows).toHaveLength(1)
    expect(dto.rows[0]).toMatchObject({ invoice: 'A-1', dealer: 'Dealer B', difference: 640, department: 'Timesheets · Generic', why: ['Invoice created after the snapshot (10/02/2026)'] })
    expect(dto.snapshot).toMatchObject({ total: 100, rowCount: 1, dealers: 'All' })
  })

  it('a user that only sees B opens the snapshot (no 404) and sees that row, with the totals of B only', async () => {
    const m = makeMocks([])
    const { service } = compareService(m, [20])
    const dto = await service.compare(RESTRICTED, 7)
    expect(dto.snapshot).toMatchObject({ total: 0, rowCount: 0 })
    expect(dto.totals).toEqual({ snapshot: 0, today: 640, difference: 640 })
    expect(dto.rows.map((r) => r.dealerId)).toEqual([20])
    const f = m.repository.openRows.mock.calls[0][0] as unknown as Record<string, unknown>
    expect(f).toMatchObject({ dealerIds: [20], skipDealerRestriction: false, idUsuario: 4972 })
  })

  it('in the list, the restricted user sees the total of their dealers, not the snapshot one', async () => {
    const m = makeMocks([])
    const { service } = compareService(m, [10])
    const page = await service.list(RESTRICTED, {})
    expect(page.results).toHaveLength(1)
    expect(page.results[0]).toMatchObject({ id: 7, total: 100, rowCount: 1, dealers: 'All' })
  })

  it('a snapshot with none of the dealers of the user: out of the list and 404 by id', async () => {
    const m = makeMocks([])
    const { service } = compareService(m, [55])
    expect((await service.list(RESTRICTED, {})).results).toEqual([])
    await expect(service.compare(RESTRICTED, 7)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('a snapshot of another company: 404', async () => {
    const m = makeMocks([])
    const { service } = compareService(m, [10, 20])
    await expect(service.compare({ ...ADMIN, idDealerProvider: 188 }, 7)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('a removed dealer that was not in the snapshot never enters today (CODE-review 1)', async () => {
    const m = makeMocks([])
    const { service } = compareService(m, [])
    const withRemoved: OpenInvoiceSnapshotFull = {
      ...snapshot,
      id: 8,
      includeRemoved: true,
      dealerTotals: buildDealerTotals([10, 90], [{ dealerId: 10, amount: 100 }]),
    }
    m.snapshots.findOneByProvider.mockImplementation(async (id: number) => (id === 8 ? withRemoved : null))
    m.repository.removedDealersOfProvider.mockResolvedValue([
      { dealerId: 90, dealer: 'Dealer R' },
      { dealerId: 99, dealer: 'Dealer C' },
    ] as never)
    // The engine with the switch on would add every removed dealer of the company (99 included).
    m.repository.openRows.mockImplementation(async (f: { dealerIds: number[]; includeRemovedDealers?: boolean }) => [
      sqlRow({ sid: 1, amount: 100, createdYmd: '2026-09-20' }),
      ...(f.includeRemovedDealers ? [sqlRow({ sid: 99, dealerId: 99, fullNro: 'C-99', amount: 50 })] : []),
    ])
    const dto = await service.compare(ADMIN, 8)
    const f = m.repository.openRows.mock.calls[0][0] as unknown as Record<string, unknown>
    expect(f).toMatchObject({ dealerIds: [10, 90], includeRemovedDealers: false })
    expect(dto.totals).toEqual({ snapshot: 100, today: 100, difference: 0 })
    expect(dto.rows).toEqual([])
  })

  it('compared with no change in the base: no row, difference 0', async () => {
    const m = makeMocks([])
    const { service } = compareService(m, [])
    m.repository.openRows.mockImplementation(async () => [sqlRow({ sid: 1, amount: 100, createdYmd: '2026-09-20' })])
    const dto = await service.compare(ADMIN, 7)
    expect(dto.rows).toEqual([])
    expect(dto.totals.difference).toBe(0)
  })
})
