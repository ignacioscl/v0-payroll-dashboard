/**
 * Monthly Closing y Window Tint Closing contra la copia local de PROD (`srssui5_srs_20261030` en 127.0.0.1:3307):
 * P1, P3, P4, P6 y P7 de plans/plan-monthly-closing/PLAN.md y P1–P4 y P6 de plans/plan-reporte-tint/PLAN.md. Solo
 * lecturas. Se salta solo, con aviso, si la base no es la copia local.
 */
import 'dotenv/config'
import { PassThrough } from 'stream'
import ExcelJS from 'exceljs'
import type { Response } from 'express'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { addTransactionalDataSource, initializeTransactionalContext } from 'typeorm-transactional'

import configuration from 'src/configuration'
import { dataSourceOptions } from 'src/typeorm.config'
import { SRS_CONNECTION, srsDataSourceOptions } from 'src/srs/srs.datasource'
import { SrsContext } from 'src/srs/auth/srs-auth-context.service'
import { SrsPermissionRepository } from 'src/srs/auth/srs-permission.repository'
import { BillingKpiRepository } from 'src/srs/billing/repository/billing-kpi.repository'
import { PayrollSnapshotKpiRepository } from 'src/srs/payroll/repository/payroll-snapshot-kpi.repository'
import { PayrollKpiService } from 'src/srs/payroll/service/payroll-kpi.service'
import { ExpenseReportRepository } from 'src/srs/expenses/repository/expense-report.repository'
import { UsuarioSrsService } from 'src/features/srs-usuario/service/usuario-srs.service'
import { SrsMonthlyClosingModule } from './monthly-closing.module'
import { MonthlyClosingService } from './service/monthly-closing.service'
import type { MonthlyClosingDto } from './dto/monthly-closing.dto'
import { toCents } from './monthly-closing-math'
import { TINT_CLOSING_COLUMN_NOTES } from './tint-closing-column-notes'

// Expenses necesita la migration 020 (EXP_EXPENSE_GROUP), que solo tiene la copia del 30/10.
const LOCAL_COPY = 'srssui5_srs_20261030'
const ready = process.env.DB_DATABASE === LOCAL_COPY && process.env.DB_PORT === '3307'
if (!ready) console.warn(`SKIPPED monthly-closing-integration.spec.ts: la base no es la copia local ${LOCAL_COPY} en 127.0.0.1:3307`)
const describeIf = ready ? describe : describe.skip

const PROVIDER = 79 // Auto Wax
const ADMIN_USER = 76 // Admin Company de Auto Wax
const RESTRICTED_USER = 4972 // ve 408, no ve 86
const DEALER_SEEN = 408
const DEALER_NOT_SEEN = 86
const OTHER_COMPANY_DEALER = 186 // dealer de GC Installations, no de Auto Wax (expense-integration.spec.ts)
const LEXUS_PALM_BEACH = 301 // AutoNation Lexus of Palm Beach
const DELRAY_GENESIS = 626
const GC_PROVIDER = 188 // GC Installations: Expenses sí, Window Tint Closing no (migration 021)

/**
 * Septiembre 2026 en esta copia. Income = el Closing de legacy (`plans/plan-monthly-closing/conciliacion/scripts/
 * closing_rows.php`, 04/11): 32,402 filas, $2,138,720.93, y los 80 dealers iguales en filas y monto. En la copia del
 * 16/10 los dos dan hoy $2,141,229.84 (el plan midió $2,141,149.84 el 29/10: la base cambió después, no el cálculo).
 */
const SEP_INCOME = 2138720.93
/**
 * Payroll y Expenses de septiembre en esta copia, con el SQL independiente del plan (MC P7): Expenses
 * `SUM(e.amount) … e.id_detailer=79 AND e.estado=1 AND ticket_date en septiembre` = $177,970.49; Lexus of Palm Beach
 * con el redondeo de T2 = $68,518.73. En la copia del 16/10 el mismo SQL da los $161,917.16 y $69,818.73 del plan.
 */
const SEP_PAYROLL_WITH_WITHOUT_DEALER = 1479913.45
const SEP_LEXUS_PAYROLL = 68518.73
const SEP_EXPENSES = 177970.49

const admin: SrsContext = { idUsuario: ADMIN_USER, idUsuarioRolrel: null, idRol: 2, idDealerProvider: PROVIDER, isUserDealer: false, isActive: true }
const restricted: SrsContext = { ...admin, idUsuario: RESTRICTED_USER, idRol: 5 }

const sumCents = (xs: number[]) => xs.reduce((a, x) => a + toCents(x), 0)

function fakeResponse(): { res: Response; buffer: () => Buffer; headers: Record<string, string> } {
  const chunks: Buffer[] = []
  const headers: Record<string, string> = {}
  const stream = new PassThrough()
  stream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)))
  const res = Object.assign(stream, { setHeader: (k: string, v: string) => (headers[k] = v) })
  return { res: res as unknown as Response, buffer: () => Buffer.concat(chunks), headers }
}

async function loadBook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  return wb
}

/** El módulo del closing contra la base del .env, con el permiso 140 abierto (se prueba aparte). */
async function compileClosingModule(): Promise<TestingModule> {
  initializeTransactionalContext()
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ load: [configuration], isGlobal: true }),
      TypeOrmModule.forRootAsync({
        useFactory: () => dataSourceOptions,
        dataSourceFactory: async (options) => addTransactionalDataSource(new DataSource(options ?? dataSourceOptions)),
      }),
      TypeOrmModule.forRootAsync({ name: SRS_CONNECTION, useFactory: () => srsDataSourceOptions }),
      SrsMonthlyClosingModule,
    ],
  })
    // El permiso 140 se prueba aparte (Admin Company pasa siempre); acá, empresa, alcance y plata.
    .overrideProvider(SrsPermissionRepository)
    .useValue({ userHasRolAccion: async () => true, assertRolAccion: async () => undefined })
    .compile()
}

/** Los dealers activos de la empresa, como los manda el combo con «All dealers». */
async function companyDealers(srs: DataSource, provider: number): Promise<string> {
  const rows: { id: number }[] = await srs.query(
    `SELECT c.id FROM CONTRATISTA c WHERE c.estado = 1 AND c.tipo_empresa = 1
       AND EXISTS (SELECT 1 FROM DEALER_REL dr WHERE dr.id_dealer_customer = c.id AND dr.id_dealer_provider = ?)
     ORDER BY c.id`,
    [provider],
  )
  return rows.map((r) => r.id).join(',')
}

/** Suma en centavos de la columna `header` de una hoja (título en la fila 2, datos desde la 3). */
function sheetColumnCents(wb: ExcelJS.Workbook, sheet: string, header: string, skipDealers: string[] = []): number {
  const ws = wb.getWorksheet(sheet)
  if (!ws) throw new Error(`sheet ${sheet} not found`)
  const headers = (ws.getRow(2).values as unknown[]).slice(1)
  const col = headers.indexOf(header) + 1
  let cents = 0
  ws.eachRow((row, n) => {
    if (n < 3) return
    if (skipDealers.includes(String(row.getCell(1).value))) return
    cents += toCents(Number(row.getCell(col).value ?? 0))
  })
  return cents
}

describeIf('Monthly Closing — integración contra la copia local (solo lectura)', () => {
  let moduleRef: TestingModule
  let srs: DataSource
  let service: MonthlyClosingService
  let billing: BillingKpiRepository
  let allDealers: string

  const q = (month: string, scope?: 'all' | 'tint') => ({ month, idDealer: allDealers, scope })

  beforeAll(async () => {
    moduleRef = await compileClosingModule()
    srs = moduleRef.get(`${SRS_CONNECTION}DataSource`) as DataSource
    service = moduleRef.get(MonthlyClosingService)
    billing = moduleRef.get(BillingKpiRepository)
    allDealers = await companyDealers(srs, PROVIDER)
  }, 60000)

  afterAll(async () => {
    await moduleRef?.close()
  })

  describe('Monthly Closing, septiembre 2026', () => {
    let mc: MonthlyClosingDto
    beforeAll(async () => {
      mc = await service.getSummary(admin, q('2026-09'))
    }, 120000)

    it('Total = suma de las filas más Without dealer, al centavo (D9 de plan-reunion-juan-18-11)', () => {
      expect(mc.withoutDealer).not.toBeNull()
      const wd = toCents(mc.withoutDealer!.payroll)
      expect(toCents(mc.total.income)).toBe(sumCents(mc.rows.map((r) => r.income)))
      expect(toCents(mc.total.expenses)).toBe(sumCents(mc.rows.map((r) => r.expenses)))
      expect(toCents(mc.total.payroll)).toBe(sumCents(mc.rows.map((r) => r.payroll)) + wd)
      expect(toCents(mc.total.profit)).toBe(sumCents(mc.rows.map((r) => r.profit)) - wd)
      expect(mc.periods.map((p) => [p.desde, p.hasta])).toEqual([
        ['2026-08-31', '2026-09-15'],
        ['2026-09-16', '2026-09-30'],
      ])
    })

    it('P7: Income = Closing de legacy; Payroll y Expenses = el SQL independiente', () => {
      expect(mc.total.income).toBe(SEP_INCOME)
      expect({
        payroll: mc.total.payroll,
        lexus: mc.rows.find((r) => r.dealerId === LEXUS_PALM_BEACH)?.payroll,
        expenses: mc.total.expenses,
      }).toEqual({ payroll: SEP_PAYROLL_WITH_WITHOUT_DEALER, lexus: SEP_LEXUS_PAYROLL, expenses: SEP_EXPENSES })
    })

    it('P1: las líneas de Income de cada dealer suman su Income al centavo', async () => {
      const cc = await (service as any).prepare(admin, q('2026-09'), allDealers)
      const lines = await service.incomeLines(cc)
      const byDealer = new Map<number, number>()
      for (const l of lines) byDealer.set(l.dealerId, (byDealer.get(l.dealerId) ?? 0) + l.cents)
      const income = await billing.incomeByDealerForRange(cc.filter)
      const diffs: string[] = []
      for (const [id, r] of income) {
        const got = byDealer.get(id) ?? 0
        if (got !== toCents(r.income)) diffs.push(`${id}: lines ${got / 100} vs income ${r.income}`)
      }
      expect(diffs).toEqual([])
      // Las líneas de $0 del Closing están (includeZero fijo).
      expect(lines.some((l) => l.cents === 0)).toBe(true)
    }, 120000)

    it('el detalle de un dealer suma su fila en las tres solapas', async () => {
      const row = mc.rows.find((r) => r.dealerId === LEXUS_PALM_BEACH)!
      const d = await service.getDealer(admin, row.dealerId, q('2026-09'))
      expect(sumCents(d.income.map((l) => l.total))).toBe(toCents(row.income))
      expect(sumCents(d.payroll.map((l) => l.amount))).toBe(toCents(row.payroll))
      expect(sumCents(d.expenses.map((l) => l.amount))).toBe(toCents(row.expenses))
    }, 120000)

    it('Without dealer: solo Payroll y suma su fila', async () => {
      const d = await service.getDealer(admin, 0, q('2026-09'))
      expect(d.income).toEqual([])
      expect(d.expenses).toEqual([])
      expect(sumCents(d.payroll.map((l) => l.amount))).toBe(toCents(mc.withoutDealer!.payroll))
    }, 120000)

    it('Excel: Summary = pantalla y cada hoja de detalle suma su columna', async () => {
      const { res, buffer, headers } = fakeResponse()
      await service.export(admin, q('2026-09'), res)
      expect(headers['Content-Disposition']).toContain('Monthly Closing 09-2026_')
      const wb = await loadBook(buffer())
      expect(wb.worksheets.map((w) => w.name)).toEqual(['Report Info', 'Summary', 'Income', 'Payroll', 'Expenses'])
      const totals = ['Total', 'Without dealer']
      expect(sheetColumnCents(wb, 'Summary', 'Income', totals)).toBe(toCents(mc.total.income))
      expect(sheetColumnCents(wb, 'Income', 'Total')).toBe(toCents(mc.total.income))
      expect(sheetColumnCents(wb, 'Payroll', 'Amount')).toBe(toCents(mc.total.payroll))
      expect(sheetColumnCents(wb, 'Expenses', 'Amount')).toBe(toCents(mc.total.expenses))
      // MC no lleva notas en los títulos.
      expect(wb.getWorksheet('Summary')!.getRow(2).getCell(1).note).toBeUndefined()
    }, 300000)
  })

  // Income, Vehicles y Payroll del Window Tint Closing con la regla del tintero (plans/plan-window-tint-closing-tint-y-
  // servicios): window-tint-closing-tinteros-integration.spec.ts, contra la copia del 07/11. Acá queda lo que no cambió.
  describe('Window Tint Closing', () => {
    it('septiembre 2026: Expenses $3,079.92', async () => {
      const tint = await service.getSummary(admin, q('2026-09', 'tint'))
      expect(tint.scope).toBe('tint')
      expect(tint.total.expenses).toBe(3079.92)
      expect(tint.rows.every((r) => r.accident === null && r.vehicles !== null)).toBe(true)
    }, 120000)

    it('ninguna línea TTK; el detalle suma su fila', async () => {
      const tint = await service.getSummary(admin, q('2026-08', 'tint'))
      const row = tint.rows.find((r) => r.dealerId === DELRAY_GENESIS)!
      const d = await service.getDealer(admin, row.dealerId, q('2026-08', 'tint'))
      expect(d.income.some((l) => l.department === 'TTK')).toBe(false)
      expect(sumCents(d.income.map((l) => l.total))).toBe(toCents(row.income))
      expect(sumCents(d.payroll.map((l) => l.amount))).toBe(toCents(row.payroll))
    }, 120000)

    it('Excel: seis hojas, By service suma el Income y las notas son las del cartel', async () => {
      const tint = await service.getSummary(admin, q('2026-08', 'tint'))
      const { res, buffer, headers } = fakeResponse()
      await service.export(admin, q('2026-08', 'tint'), res)
      expect(headers['Content-Disposition']).toContain('Window Tint Closing 08-2026_')
      const wb = await loadBook(buffer())
      expect(wb.worksheets.map((w) => w.name)).toEqual(['Report Info', 'Summary', 'By service', 'Income', 'Payroll', 'Expenses'])
      expect(sheetColumnCents(wb, 'By service', 'Amount')).toBe(toCents(tint.total.income))
      const summaryHeader = wb.getWorksheet('Summary')!.getRow(2)
      const notes = [1, 2, 3, 4, 5, 6, 7].map((i) => summaryHeader.getCell(i).note)
      expect(notes).toEqual([
        TINT_CLOSING_COLUMN_NOTES.dealer,
        TINT_CLOSING_COLUMN_NOTES.vehicles,
        TINT_CLOSING_COLUMN_NOTES.income,
        TINT_CLOSING_COLUMN_NOTES.payroll,
        TINT_CLOSING_COLUMN_NOTES.expenses,
        TINT_CLOSING_COLUMN_NOTES.profit,
        TINT_CLOSING_COLUMN_NOTES.pct,
      ])
      const info = wb.getWorksheet('Report Info')!
      const fields: string[] = []
      info.eachRow((r) => fields.push(String(r.getCell(1).value)))
      expect(fields).toEqual(expect.arrayContaining(['Tint services', 'Tinters', 'Expense category', 'Pay periods']))
    }, 300000)
  })

  // El check se llama «Closing reports» desde D17 de plans/plan-reunion-juan-18-11 (misma columna) y abre los dos.
  describe('Check «Closing reports» de la empresa (plans/plan-checks-expenses-tint, migration 021)', () => {
    const gcAdmin: SrsContext = { ...admin, idUsuario: 1, idDealerProvider: GC_PROVIDER }
    let gcDealers: string

    beforeAll(async () => {
      const rows: { id: number }[] = await srs.query(
        `SELECT c.id FROM CONTRATISTA c WHERE c.estado = 1 AND c.tipo_empresa = 1
           AND EXISTS (SELECT 1 FROM DEALER_REL dr WHERE dr.id_dealer_customer = c.id AND dr.id_dealer_provider = ?)
         ORDER BY c.id`,
        [GC_PROVIDER],
      )
      gcDealers = rows.map((r) => r.id).join(',')
    })

    it('sin el check: 403 en el resumen, el dealer y el export de tint', async () => {
      const tint = { month: '2026-09', idDealer: gcDealers, scope: 'tint' as const }
      await expect(service.getSummary(gcAdmin, tint)).rejects.toBeInstanceOf(ForbiddenException)
      await expect(service.getDealer(gcAdmin, Number(gcDealers.split(',')[0]), tint)).rejects.toBeInstanceOf(
        ForbiddenException,
      )
      await expect(service.export(gcAdmin, tint, fakeResponse().res)).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('sin el check: Monthly Closing (scope=all) también da 403 (D17), aunque sea admin', async () => {
      const mc = { month: '2026-09', idDealer: gcDealers }
      await expect(service.getSummary(gcAdmin, mc)).rejects.toBeInstanceOf(ForbiddenException)
      await expect(service.export(gcAdmin, mc, fakeResponse().res)).rejects.toBeInstanceOf(ForbiddenException)
    })
  })

  describe('P6: aislamiento', () => {
    it('un usuario restringido no recibe Without dealer ni abre un dealer fuera de su filtro', async () => {
      const mc = await service.getSummary(restricted, { month: '2026-09', idDealer: String(DEALER_SEEN) })
      expect(mc.withoutDealer).toBeNull()
      await expect(service.getDealer(restricted, 0, { month: '2026-09', idDealer: String(DEALER_SEEN) })).rejects.toBeInstanceOf(
        ForbiddenException,
      )
      await expect(
        service.getDealer(restricted, DEALER_NOT_SEEN, { month: '2026-09', idDealer: String(DEALER_SEEN) }),
      ).rejects.toBeInstanceOf(ForbiddenException)
      // El export nombra los dealers pedidos: uno fuera del alcance, o de otra empresa, es 403.
      await expect(
        service.export(restricted, { month: '2026-09', idDealer: `${DEALER_SEEN},${DEALER_NOT_SEEN}` }, fakeResponse().res),
      ).rejects.toBeInstanceOf(ForbiddenException)
      await expect(
        service.export(admin, { month: '2026-09', idDealer: `${allDealers},${OTHER_COMPANY_DEALER}` }, fakeResponse().res),
      ).rejects.toBeInstanceOf(ForbiddenException)
    }, 120000)

    it('mes inválido: 400 en el campo month', async () => {
      for (const month of ['2026-13', '2026-9', 'abc', '2019-12', '']) {
        const err = await service.getSummary(admin, q(month)).catch((e) => e)
        expect(err).toBeInstanceOf(BadRequestException)
        expect((err as BadRequestException).getResponse()).toMatchObject({ field: 'month', message: 'Choose a valid month.' })
      }
    })
  })
})

/**
 * Vendors en el closing (plans/plan-reunion-juan-18-11, tema 4, D6) contra la copia del 12/11, que tiene
 * `usuarios.is_vendor` (migration 030) y EXP_EXPENSE_PIECEWORK_WO (migration 032). Ya no se excluye a nadie: el vendor
 * cuenta en el Payroll como cualquier empleado, y solo lo que está en una expense Piecework activa sale del Payroll y
 * entra en Expenses. Esto último, con escrituras y su limpieza, lo prueba
 * src/features/srs-expense/expense-piecework-integration.spec.ts. Acá, solo lecturas: el Payroll de Francol Services
 * LLC (6985, vendor de Auto Wax) sigue en Land Rover Ft Lauderdale, menos lo que ya esté en una expense Piecework activa
 * de la copia (se lee con SQL independiente: sin ninguna, entero).
 */
const VENDORS_COPY = 'srssui5_srs_20261112'
const vendorsReady = process.env.DB_DATABASE === VENDORS_COPY && process.env.DB_PORT === '3307'
if (!vendorsReady) console.warn(`SKIPPED vendors de monthly-closing-integration.spec.ts: la base no es la copia local ${VENDORS_COPY}`)
const describeVendors = vendorsReady ? describe : describe.skip

const FRANCOL = 6985 // Francol Services LLC: vendor (is_vendor = 1), todo octubre en Land Rover Ft Lauderdale
const LAND_ROVER_FTL = 627
/** Octubre 2026 en la copia del 12/11 (SUM(monto + monto_tax) de PAYROLL_SNAPSHOT_DAY), con Francol adentro. */
const OCT_LAND_ROVER_PAYROLL = 74312.21
const OCT_FRANCOL = 14161
const OCT_WITHOUT_DEALER = 10500

describeVendors('Vendors en el Payroll del closing — copia del 12/11 (solo lectura)', () => {
  let moduleRef: TestingModule
  let srs: DataSource
  let service: MonthlyClosingService
  let usuarios: UsuarioSrsService
  let payroll: PayrollSnapshotKpiRepository
  let expenses: ExpenseReportRepository
  let spend: PayrollKpiService
  let allDealers: string
  let mc: MonthlyClosingDto
  /** Lo de expenses Piecework activas en los pay periods de octubre, por `dealer|período`, en centavos (SQL propio). */
  let inExpenses: Map<string, number>
  /** Land Rover y Francol en Land Rover, ya sin eso. */
  let landRoverCents: number
  let francolCents: number

  const q = () => ({ month: '2026-10', idDealer: allDealers })
  const isFrancol = (employee: string) => /francol/i.test(employee)

  beforeAll(async () => {
    moduleRef = await compileClosingModule()
    srs = moduleRef.get(`${SRS_CONNECTION}DataSource`) as DataSource
    service = moduleRef.get(MonthlyClosingService)
    usuarios = moduleRef.get(UsuarioSrsService, { strict: false })
    payroll = moduleRef.get(PayrollSnapshotKpiRepository, { strict: false })
    expenses = moduleRef.get(ExpenseReportRepository, { strict: false })
    spend = moduleRef.get(PayrollKpiService, { strict: false })
    allDealers = await companyDealers(srs, PROVIDER)
    // Auto Wax no tiene % de payroll tax: lo de las expenses se resta sin tax.
    const [cfg]: { pct: string }[] = await srs.query(`SELECT IFNULL(daily_report_payroll_tax, 0) AS pct FROM CONTRATISTA WHERE id = ?`, [PROVIDER])
    expect(Number(cfg.pct)).toBe(0)
    const active: { k: string; cents: string }[] = await srs.query(
      `SELECT CONCAT(pw.id_dealer, '|', IF(pw.work_date <= '2026-10-15', '2026-10-01', '2026-10-16')) AS k, ROUND(SUM(pw.amount) * 100) AS cents
         FROM EXP_EXPENSE_PIECEWORK_WO pw
         JOIN EXP_EXPENSE e ON e.id = pw.id_expense AND e.estado = 1 AND e.id_detailer = ?
        WHERE pw.deleted_at IS NULL AND pw.work_date BETWEEN '2026-10-01' AND '2026-10-30'
        GROUP BY k`,
      [PROVIDER],
    )
    inExpenses = new Map(active.map((r) => [r.k, Number(r.cents)]))
    const [francolIn]: { cents: string }[] = await srs.query(
      `SELECT IFNULL(ROUND(SUM(pw.amount) * 100), 0) AS cents FROM EXP_EXPENSE_PIECEWORK_WO pw
         JOIN EXP_EXPENSE e ON e.id = pw.id_expense AND e.estado = 1 AND e.id_detailer = ?
        WHERE pw.deleted_at IS NULL AND pw.id_employee = ? AND pw.id_dealer = ? AND pw.work_date BETWEEN '2026-10-01' AND '2026-10-30'`,
      [PROVIDER, FRANCOL, LAND_ROVER_FTL],
    )
    const landRoverIn = [...inExpenses].filter(([k]) => k.startsWith(`${LAND_ROVER_FTL}|`)).reduce((a, [, c]) => a + c, 0)
    landRoverCents = toCents(OCT_LAND_ROVER_PAYROLL) - landRoverIn
    francolCents = toCents(OCT_FRANCOL) - Number(francolIn.cents)
    mc = await service.getSummary(admin, q())
  }, 180000)

  afterEach(() => jest.restoreAllMocks())

  afterAll(async () => {
    await moduleRef?.close()
  })

  it('Francol está marcado vendor y el closing ya no mira la marca, en los dos scopes', async () => {
    expect((await usuarios.activeVendors(PROVIDER)).map((v) => v.id)).toContain(FRANCOL)
    const activeVendors = jest.spyOn(usuarios, 'activeVendors')
    const all = await (service as any).prepare(admin, { ...q(), scope: 'all' }, allDealers)
    const tint = await (service as any).prepare(admin, { ...q(), scope: 'tint' }, allDealers)
    expect(activeVendors).not.toHaveBeenCalled()
    expect(all).not.toHaveProperty('vendorIds')
    expect(tint).not.toHaveProperty('vendorIds')
  }, 60000)

  it('Summary de octubre: Land Rover Ft Lauderdale con el Payroll de Francol (menos lo que esté en expenses Piecework) y Without dealer igual', async () => {
    const landRover = mc.rows.find((r) => r.dealerId === LAND_ROVER_FTL)!
    expect(toCents(landRover.payroll)).toBe(landRoverCents)
    expect(mc.withoutDealer?.payroll).toBe(OCT_WITHOUT_DEALER)

    const cc = await (service as any).prepare(admin, q(), allDealers)
    const desdes: string[] = cc.periods.map((p: { desde: string }) => p.desde)
    expect(desdes).toEqual(['2026-10-01', '2026-10-16'])
    // El descuento es exactamente lo de las expenses Piecework activas (sin ninguna, nada).
    expect((await (service as any).payrollDeduction(cc)).byKey).toEqual(inExpenses)
    const read = await expenses.pieceworkInExpenses(PROVIDER, '2026-10-01', '2026-10-30')
    expect(read.reduce((a, r) => a + toCents(r.amount), 0)).toBe([...inExpenses.values()].reduce((a, c) => a + c, 0))

    // El snapshot, por SQL independiente: lo de Francol en 627 son $14,161.00, sin ninguna exclusión.
    const [francol]: { cents: string }[] = await srs.query(
      `SELECT ROUND(SUM(p.monto + p.monto_tax) * 100) AS cents FROM PAYROLL_SNAPSHOT_DAY p
        WHERE p.id_contratista = ? AND p.id_usuario = ? AND p.id_dealer = ? AND p.periodo_desde IN (?, ?)`,
      [PROVIDER, FRANCOL, LAND_ROVER_FTL, ...desdes],
    )
    expect(Number(francol.cents)).toBe(toCents(OCT_FRANCOL))
    const rows = await payroll.amountsByDealerPeriodType(cc.filter, desdes, true)
    const cents = Math.round(rows.filter((r) => r.idDealer === LAND_ROVER_FTL).reduce((a, r) => a + r.monto + r.tax, 0) * 100)
    expect(cents).toBe(toCents(OCT_LAND_ROVER_PAYROLL))
  }, 120000)

  it('detalle de Land Rover: las filas de Francol están (sus dos pay periods) y el detalle suma su fila', async () => {
    const d = await service.getDealer(admin, LAND_ROVER_FTL, q())
    const francol = d.payroll.filter((l) => isFrancol(l.employee))
    expect(francol).toHaveLength(2)
    expect(sumCents(francol.map((l) => l.amount))).toBe(francolCents)
    expect(sumCents(d.payroll.map((l) => l.amount))).toBe(landRoverCents)
  }, 120000)

  it('Excel: Summary y hoja Payroll con Francol, iguales a la pantalla', async () => {
    const { res, buffer } = fakeResponse()
    await service.export(admin, q(), res)
    const wb = await loadBook(buffer())
    const landRover = mc.rows.find((r) => r.dealerId === LAND_ROVER_FTL)!

    const summary = sheetRows(wb, 'Summary')
    expect(toCents(Number(summary.find((r) => r.Dealer === landRover.dealer)?.Payroll))).toBe(landRoverCents)

    const payrollSheet = sheetRows(wb, 'Payroll')
    const francolSheet = payrollSheet
      .filter((r) => r.Dealer === landRover.dealer && isFrancol(String(r.Employee)))
      .reduce((a, r) => a + toCents(Number(r.Amount)), 0)
    expect(francolSheet).toBe(francolCents)
    const lrCents = payrollSheet
      .filter((r) => r.Dealer === landRover.dealer)
      .reduce((a, r) => a + toCents(Number(r.Amount)), 0)
    expect(lrCents).toBe(landRoverCents)
    expect(sheetColumnCents(wb, 'Payroll', 'Amount')).toBe(toCents(mc.total.payroll))
  }, 300000)

  it('P5: Payroll Spend no usa los métodos del closing ni las expenses Piecework', async () => {
    const query = { fechaDesde: '2026-10-01', fechaHasta: '2026-10-31', idDealer: allDealers }
    const typeSpy = jest.spyOn(payroll, 'amountsByDealerPeriodType')
    const employeeSpy = jest.spyOn(payroll, 'amountsByDealerEmployeeForPeriods')
    const pieceworkSpy = jest.spyOn(expenses, 'pieceworkInExpenses')
    const result = await spend.getSpend(admin, query)
    expect(typeSpy).not.toHaveBeenCalled()
    expect(employeeSpy).not.toHaveBeenCalled()
    expect(pieceworkSpy).not.toHaveBeenCalled()
    expect(result.totalPayroll).toBeGreaterThan(0)
  }, 180000)
})

/** Filas de datos de una hoja como objetos por título (título en la fila 2, datos desde la 3). */
function sheetRows(wb: ExcelJS.Workbook, sheet: string): Record<string, unknown>[] {
  const ws = wb.getWorksheet(sheet)
  if (!ws) throw new Error(`sheet ${sheet} not found`)
  const headers = (ws.getRow(2).values as unknown[]).slice(1).map(String)
  const out: Record<string, unknown>[] = []
  ws.eachRow((row, n) => {
    if (n < 3) return
    out.push(Object.fromEntries(headers.map((h, i) => [h, row.getCell(i + 1).value])))
  })
  return out
}

