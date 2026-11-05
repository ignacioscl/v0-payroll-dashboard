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
const NISSAN_MIAMI = 744 // AutoNation Nissan Miami
const DELRAY_HYUNDAI = 625
const DELRAY_GENESIS = 626

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
    initializeTransactionalContext()
    moduleRef = await Test.createTestingModule({
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
    srs = moduleRef.get(`${SRS_CONNECTION}DataSource`) as DataSource
    service = moduleRef.get(MonthlyClosingService)
    billing = moduleRef.get(BillingKpiRepository)
    const rows: { id: number }[] = await srs.query(
      `SELECT c.id FROM CONTRATISTA c WHERE c.estado = 1 AND c.tipo_empresa = 1
         AND EXISTS (SELECT 1 FROM DEALER_REL dr WHERE dr.id_dealer_customer = c.id AND dr.id_dealer_provider = ?)
       ORDER BY c.id`,
      [PROVIDER],
    )
    allDealers = rows.map((r) => r.id).join(',')
  }, 60000)

  afterAll(async () => {
    await moduleRef?.close()
  })

  describe('Monthly Closing, septiembre 2026', () => {
    let mc: MonthlyClosingDto
    beforeAll(async () => {
      mc = await service.getSummary(admin, q('2026-09'))
    }, 120000)

    it('Total = suma de las filas al centavo; Without dealer fuera del Total', () => {
      for (const key of ['income', 'payroll', 'expenses', 'profit'] as const) {
        expect(toCents(mc.total[key])).toBe(sumCents(mc.rows.map((r) => r[key])))
      }
      expect(mc.withoutDealer).not.toBeNull()
      expect(mc.periods.map((p) => [p.desde, p.hasta])).toEqual([
        ['2026-08-31', '2026-09-15'],
        ['2026-09-16', '2026-09-30'],
      ])
    })

    it('P7: Income = Closing de legacy; Payroll y Expenses = el SQL independiente', () => {
      expect(mc.total.income).toBe(SEP_INCOME)
      expect({
        payroll: fromTotal(mc.total.payroll, mc.withoutDealer?.payroll ?? 0),
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
      expect(sheetColumnCents(wb, 'Payroll', 'Amount')).toBe(toCents(mc.total.payroll) + toCents(mc.withoutDealer!.payroll))
      expect(sheetColumnCents(wb, 'Expenses', 'Amount')).toBe(toCents(mc.total.expenses))
      // MC no lleva notas en los títulos.
      expect(wb.getWorksheet('Summary')!.getRow(2).getCell(1).note).toBeUndefined()
    }, 300000)
  })

  describe('Window Tint Closing', () => {
    it('agosto 2026: Income $74,184.00 en 889 líneas, Vehicles 889, Payroll $5,110.00, Expenses $0', async () => {
      const tint = await service.getSummary(admin, q('2026-08', 'tint'))
      expect(tint.scope).toBe('tint')
      expect(tint.total.income).toBe(74184)
      expect(tint.total.vehicles).toBe(889)
      expect(tint.total.payroll).toBe(5110)
      expect(tint.total.expenses).toBe(0)
      expect(tint.rows.every((r) => r.accident === null && r.vehicles !== null)).toBe(true)
      const byId = new Map(tint.rows.map((r) => [r.dealerId, r]))
      expect(byId.get(NISSAN_MIAMI)?.payroll).toBe(970)
      expect(byId.get(DELRAY_GENESIS)?.payroll).toBe(1535)
      expect(byId.get(DELRAY_HYUNDAI)?.payroll).toBe(2605)
    }, 120000)

    it('septiembre 2026: Payroll $7,700.00 y Expenses $3,079.92', async () => {
      const tint = await service.getSummary(admin, q('2026-09', 'tint'))
      expect(tint.total.payroll).toBe(7700)
      expect(tint.total.expenses).toBe(3079.92)
    }, 120000)

    it('ninguna línea TTK ni ponchada de generic; el detalle suma su fila', async () => {
      const tint = await service.getSummary(admin, q('2026-08', 'tint'))
      const row = tint.rows.find((r) => r.dealerId === DELRAY_GENESIS)!
      const d = await service.getDealer(admin, row.dealerId, q('2026-08', 'tint'))
      expect(d.income.every((l) => /tint/i.test(l.service))).toBe(true)
      expect(d.income.some((l) => l.department === 'TTK')).toBe(false)
      expect(sumCents(d.income.map((l) => l.total))).toBe(toCents(row.income))
      expect(sumCents(d.payroll.map((l) => l.amount))).toBe(toCents(row.payroll))
    }, 120000)

    it('Excel: seis hojas, By service suma el Income y las notas son las del cartel', async () => {
      const { res, buffer, headers } = fakeResponse()
      await service.export(admin, q('2026-08', 'tint'), res)
      expect(headers['Content-Disposition']).toContain('Window Tint Closing 08-2026_')
      const wb = await loadBook(buffer())
      expect(wb.worksheets.map((w) => w.name)).toEqual(['Report Info', 'Summary', 'By service', 'Income', 'Payroll', 'Expenses'])
      expect(sheetColumnCents(wb, 'By service', 'Amount')).toBe(7418400)
      expect(sheetColumnCents(wb, 'By service', 'Vehicles')).toBe(88900)
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

function fromTotal(dealers: number, withoutDealer: number): number {
  return (toCents(dealers) + toCents(withoutDealer)) / 100
}
