/**
 * Window Tint Closing contra la copia local de PROD del 12/11 (`srssui5_srs_20261112` en 127.0.0.1:3307). Solo
 * lecturas. Se salta solo, con aviso, si la base no es esa copia.
 *
 * Reglas (reunión con Juan 18/11, plans/plan-reunion-juan-18-11):
 *  - D14: tintero = empleado de la empresa con un rol que tiene «tint» en el nombre, sin mirar su tipo de pago.
 *  - Tema 6 / D10: de las WO asignadas a un tintero entran solo los servicios con «tint», en Income, Vehicles y
 *    Payroll. Del Payroll de cada tintero se resta el piecework de sus servicios sin «tint». Sin filas en rojo.
 *  - D2: las líneas libres de Generic con «tint» siguen contando; nunca TTK.
 */
import 'dotenv/config'
import { PassThrough } from 'stream'
import ExcelJS from 'exceljs'
import type { Response } from 'express'
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
import { PayrollSourceRepository } from 'src/srs/payroll/snapshot/payroll-source.repository'
import { PAYMENT_TYPE_IDS, PIECEWORK_TYPE_IDS } from 'src/srs/payroll/snapshot/payment-type-ids'
import { THEME } from 'src/srs/shared/export/xlsx-theme'
import { ExpenseLineRow, ExpenseReportRepository } from 'src/srs/expenses/repository/expense-report.repository'
import type { MonthlyClosingDealerDto, MonthlyClosingDto } from './dto/monthly-closing.dto'
import { SrsMonthlyClosingModule } from './monthly-closing.module'
import { MonthlyClosingService } from './service/monthly-closing.service'
import { TINT_SERVICE_FRAGMENT, canonicalPayrollCents, isTintService, payrollKey, toCents } from './monthly-closing-math'

const LOCAL_COPY = 'srssui5_srs_20261112'
const ready = process.env.DB_DATABASE === LOCAL_COPY && process.env.DB_PORT === '3307'
if (!ready) {
  console.warn(`SKIPPED window-tint-closing-tinteros-integration.spec.ts: la base no es la copia local ${LOCAL_COPY} en 127.0.0.1:3307`)
}
const describeIf = ready ? describe : describe.skip

const PROVIDER = 79 // Auto Wax
const ADMIN_USER = 76 // Admin Company de Auto Wax
const NISSAN_MIAMI = 744 // AutoNation Nissan Miami
const LEXUS_PALM_BEACH = 301
const MONTH = '2026-10'
/** Ningún servicio tiene esto en el nombre: con él, nonTintPieceworkRows trae TODO el piecework del snapshot. */
const MATCHES_NO_SERVICE = '§ningún servicio§'
const admin: SrsContext = { idUsuario: ADMIN_USER, idUsuarioRolrel: null, idRol: 2, idDealerProvider: PROVIDER, isUserDealer: false, isActive: true }

const sumCents = (xs: number[]) => xs.reduce((a, x) => a + toCents(x), 0)

/** Consulta independiente de los tinteros (D14): rol con «tint», de la empresa, sin mirar el tipo de pago. */
const TINTERS_SQL = `
  SELECT DISTINCT ur.id_usuario AS id
  FROM USUARIO_ROL_REL ur
  JOIN ROL r ON r.id_rol = ur.id_rol
  JOIN usuarios u ON u.id_usuario = ur.id_usuario
  WHERE r.id_compania_owner = ? AND u.id_contratista_owner = ? AND LOWER(r.nombre) LIKE '%tint%'
  ORDER BY id`

/** Por dealer, los servicios con «tint» de las WO del mes asignadas a un tintero. Monto = price × qty. */
const BY_DEALER_SQL = `
  SELECT d.id_dealer AS dealerId,
         ROUND(SUM(isr.price * IFNULL(isr.qty, 1)), 2) AS income,
         SUM(IFNULL(isr.qty, 1)) AS vehicles
  FROM INVOICE i
  JOIN DEPARTMENT d ON d.id = i.id_department
  JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
  JOIN INVOICE_SERVICE s ON s.id = isr.id_service_invoice
  WHERE i.estado = 1 AND i.id_dealer_provider = ? AND i.fecha_alta >= ? AND i.fecha_alta < DATE_ADD(?, INTERVAL 1 DAY)
    AND LOWER(s.nombre) LIKE '%tint%'
    AND EXISTS (SELECT 1 FROM INVOICE_EMPLOYEE_REL ier WHERE ier.id_invoice = i.id AND ier.id_usuario IN (__TINTERS__))
  GROUP BY d.id_dealer`

function fakeResponse(): { res: Response; buffer: () => Buffer } {
  const chunks: Buffer[] = []
  const stream = new PassThrough()
  stream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)))
  const res = Object.assign(stream, { setHeader: () => undefined })
  return { res: res as unknown as Response, buffer: () => Buffer.concat(chunks) }
}

/**
 * El módulo del closing contra la base del .env, con el permiso 140 abierto (se prueba en el otro spec). Uno solo
 * para todo el archivo: typeorm-transactional no deja registrar dos veces el DataSource «default».
 */
let sharedModule: Promise<TestingModule> | null = null
function compileClosingModule(): Promise<TestingModule> {
  sharedModule ??= compileOnce()
  return sharedModule
}
afterAll(async () => {
  await (await sharedModule)?.close()
})

async function compileOnce(): Promise<TestingModule> {
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
    .overrideProvider(SrsPermissionRepository)
    .useValue({ userHasRolAccion: async () => true, assertRolAccion: async () => undefined })
    .compile()
}

async function companyDealers(srs: DataSource): Promise<string> {
  const rows: { id: number }[] = await srs.query(
    `SELECT c.id FROM CONTRATISTA c WHERE c.estado = 1 AND c.tipo_empresa = 1
       AND EXISTS (SELECT 1 FROM DEALER_REL dr WHERE dr.id_dealer_customer = c.id AND dr.id_dealer_provider = ?)
     ORDER BY c.id`,
    [PROVIDER],
  )
  return rows.map((r) => r.id).join(',')
}

describeIf('Window Tint Closing — solo servicios con «tint», contra la copia local (solo lectura)', () => {
  let moduleRef: TestingModule
  let srs: DataSource
  let service: MonthlyClosingService
  let billing: BillingKpiRepository
  let payroll: PayrollSnapshotKpiRepository
  let source: PayrollSourceRepository
  let allDealers: string
  let tinters: number[]
  let summary: MonthlyClosingDto

  const q = (month: string, scope: 'all' | 'tint' = 'tint') => ({ month, idDealer: allDealers, scope })

  beforeAll(async () => {
    moduleRef = await compileClosingModule()
    srs = moduleRef.get(`${SRS_CONNECTION}DataSource`) as DataSource
    service = moduleRef.get(MonthlyClosingService)
    billing = moduleRef.get(BillingKpiRepository)
    payroll = moduleRef.get(PayrollSnapshotKpiRepository, { strict: false })
    source = moduleRef.get(PayrollSourceRepository, { strict: false })
    allDealers = await companyDealers(srs)
    const t: { id: number }[] = await srs.query(TINTERS_SQL, [PROVIDER, PROVIDER])
    tinters = t.map((r) => Number(r.id))
    summary = await service.getSummary(admin, q(MONTH))
  }, 180000)

  it('D14: los tinteros son los de la consulta independiente (rol «tint», de la empresa), también sin Piecework', async () => {
    const cc = await (service as any).prepare(admin, q(MONTH), allDealers)
    expect(cc.employeeIds).toEqual(tinters)
    const withoutPiecework: { id: number }[] = await srs.query(
      `SELECT DISTINCT ur.id_usuario AS id FROM USUARIO_ROL_REL ur JOIN ROL r ON r.id_rol = ur.id_rol
       JOIN usuarios u ON u.id_usuario = ur.id_usuario
       WHERE r.id_compania_owner = ? AND u.id_contratista_owner = ? AND LOWER(r.nombre) LIKE '%tint%'
         AND NOT EXISTS (SELECT 1 FROM USUARIO_PAYROLL_REL p WHERE p.id_usuario = ur.id_usuario AND p.id_payment_type IN (?, ?))`,
      [PROVIDER, PROVIDER, ...PIECEWORK_TYPE_IDS],
    )
    // Antes quedaban afuera; ahora son tinteros.
    for (const r of withoutPiecework) expect(cc.employeeIds).toContain(Number(r.id))
    const owners: { owner: number }[] = await srs.query(
      `SELECT DISTINCT u.id_contratista_owner AS owner FROM usuarios u WHERE u.id_usuario IN (${tinters.map(() => '?').join(',')})`,
      tinters,
    )
    expect(owners.map((o) => Number(o.owner))).toEqual([PROVIDER])
  }, 60000)

  it('tema 6: Income de WO y Vehicles por dealer = la consulta independiente de servicios con «tint»', async () => {
    const cc = await (service as any).prepare(admin, q(MONTH), allDealers)
    const lines = await service.incomeLines(cc)
    expect(lines.every((l) => isTintService(l.service))).toBe(true)
    expect(lines.some((l) => l.kind === 'ttk' || l.kind === 'genericPunch')).toBe(false)

    const sql = BY_DEALER_SQL.replace('__TINTERS__', tinters.map(() => '?').join(','))
    const rows: { dealerId: number; income: string; vehicles: string }[] = await srs.query(sql, [
      PROVIDER,
      `${MONTH}-01`,
      `${MONTH}-31`,
      ...tinters,
    ])
    const ind = new Map(rows.map((r) => [Number(r.dealerId), { income: toCents(Number(r.income)), vehicles: Number(r.vehicles) }]))
    const got = new Map<number, { income: number; vehicles: number }>()
    for (const l of lines) {
      if (l.kind !== 'wo' && l.kind !== 'woUnbilled') continue
      const g = got.get(l.dealerId) ?? { income: 0, vehicles: 0 }
      g.income += l.cents
      g.vehicles += l.qty
      got.set(l.dealerId, g)
    }
    const diffs: string[] = []
    for (const id of new Set([...ind.keys(), ...got.keys()])) {
      const a = ind.get(id) ?? { income: 0, vehicles: 0 }
      const b = got.get(id) ?? { income: 0, vehicles: 0 }
      if (a.income !== b.income || a.vehicles !== b.vehicles) diffs.push(`${id}: sql ${a.income}/${a.vehicles} vs report ${b.income}/${b.vehicles}`)
    }
    expect(diffs).toEqual([])
  }, 180000)

  it('D10: la consulta del descuento sigue al snapshot — sin filtro de servicio da el piecework que el snapshot contó', async () => {
    const cc = await (service as any).prepare(admin, q(MONTH), allDealers)
    // Ya no se excluye a los vendors (tema 4): todos los tinteros.
    const employees = tinters
    const coverage = await payroll.periodCoverage(PROVIDER, cc.periods.map((p: { desde: string }) => p.desde))
    const diffs: string[] = []
    let total = 0
    for (const p of cc.periods as { desde: string; hasta: string }[]) {
      const covered = coverage.get(p.desde)
      if (!covered) continue
      const until = covered < p.hasta ? covered : p.hasta
      const mine = new Map<string, number>()
      for (const r of await source.nonTintPieceworkRows(PROVIDER, employees, p.desde, until, MATCHES_NO_SERVICE)) {
        const k = `${r.idUsuario}|${r.idDealer}`
        mine.set(k, (mine.get(k) ?? 0) + r.piecework)
      }
      const snap: { idUsuario: number; idDealer: number; monto: string }[] = await srs.query(
        `SELECT p.id_usuario AS idUsuario, p.id_dealer AS idDealer, SUM(p.monto) AS monto
         FROM PAYROLL_SNAPSHOT_DAY p
         WHERE p.id_contratista = ? AND p.periodo_desde = ? AND p.fecha <= ? AND p.concepto = 'ponchada'
           AND p.id_payment_type IN (?, ?) AND p.id_dealer IS NOT NULL
           AND p.id_usuario IN (${employees.map(() => '?').join(',')})
         GROUP BY p.id_usuario, p.id_dealer`,
        [PROVIDER, p.desde, until, PAYMENT_TYPE_IDS.PIECEWORK, PAYMENT_TYPE_IDS.FLAT_RATE, ...employees],
      )
      const theirs = new Map(snap.map((r) => [`${r.idUsuario}|${r.idDealer}`, Number(r.monto)]))
      for (const k of new Set([...mine.keys(), ...theirs.keys()])) {
        const a = toCents(mine.get(k) ?? 0)
        const b = toCents(theirs.get(k) ?? 0)
        total += b
        if (a !== b) diffs.push(`${p.desde} ${k}: consulta ${a / 100} vs snapshot ${b / 100}`)
      }
    }
    expect(total).toBeGreaterThan(0)
    expect(diffs).toEqual([])
  }, 600000)

  it('D10: el Payroll de cada dealer = el del snapshot menos el piecework de servicios sin «tint», al centavo', async () => {
    const cc = await (service as any).prepare(admin, q(MONTH), allDealers)
    const raw = canonicalPayrollCents(
      await payroll.amountsByDealerPeriodType(cc.filter, cc.periods.map((p: { desde: string }) => p.desde), false, cc.employeeIds),
    )
    const deduction = await (service as any).payrollDeduction(cc)
    const expected = new Map<number, number>()
    for (const [key, cents] of raw) {
      const dealer = Number(key.split('|')[0])
      expected.set(dealer, (expected.get(dealer) ?? 0) + Math.max(0, cents - (deduction.byKey.get(key) ?? 0)))
    }
    for (const row of summary.rows) expect(toCents(row.payroll)).toBe(expected.get(row.dealerId) ?? 0)
    // Cada clave del descuento es de un dealer y período del cierre (payrollKey).
    for (const key of deduction.byKey.keys()) expect(cc.periods.some((p: { desde: string }) => key.endsWith(`|${p.desde}`))).toBe(true)
    expect(payrollKey(NISSAN_MIAMI, cc.periods[0].desde)).toBe(`${NISSAN_MIAMI}|${cc.periods[0].desde}`)
  }, 600000)

  it('D10, dato de hoy: los servicios sin «tint» de los tinteros no tienen piecework, así que el descuento es $0', async () => {
    // Comprobado en la copia del 12/11, agosto a noviembre: ningún servicio sin «tint» de una WO de un tintero tiene
    // piecework (INVOICE_SERVICE_REL ni INVOICE_SERVICE_EMPLOYEE_REL). Si mañana lo tienen, esta prueba avisa. El
    // descuento suma también lo de las expenses Piecework de los tinteros (tema 4): en la copia no hay ninguna activa.
    const cc = await (service as any).prepare(admin, q(MONTH), allDealers)
    const [active]: { c: string }[] = await srs.query(
      `SELECT COUNT(*) AS c FROM EXP_EXPENSE_PIECEWORK_WO pw JOIN EXP_EXPENSE e ON e.id = pw.id_expense AND e.estado = 1 AND e.id_detailer = ?
        WHERE pw.deleted_at IS NULL AND pw.work_date BETWEEN ? AND ? AND pw.id_employee IN (${tinters.map(() => '?').join(',')})`,
      [PROVIDER, cc.periods[0].desde, cc.periods[cc.periods.length - 1].hasta, ...tinters],
    )
    expect(Number(active.c)).toBe(0)
    const deduction = await (service as any).payrollDeduction(cc)
    expect([...deduction.byKey.values()].reduce((a: number, c: number) => a + c, 0)).toBe(0)
  }, 600000)

  it('cada dealer — Income, By service y Payroll del detalle suman la fila; solo servicios con «tint»', async () => {
    for (const row of summary.rows.filter((r) => r.income !== 0 || r.payroll !== 0)) {
      const d = await service.getDealer(admin, row.dealerId, q(MONTH))
      expect(sumCents(d.byService!.map((r) => r.amount))).toBe(toCents(row.income))
      expect(sumCents(d.income.map((l) => l.total))).toBe(toCents(row.income))
      expect(sumCents(d.payroll.map((l) => l.amount))).toBe(toCents(row.payroll))
      expect(d.byService!.reduce((a, r) => a + r.vehicles, 0)).toBe(row.vehicles)
      expect(d.income.every((l) => l.tint === true)).toBe(true)
      expect(d.byService!.every((r) => r.tint)).toBe(true)
    }
  }, 900000)

  it('octubre: Nissan Miami ya no trae el PDI', async () => {
    const d = await service.getDealer(admin, NISSAN_MIAMI, q(MONTH))
    expect(d.byService!.some((r) => r.service.trim().toUpperCase() === 'PDI')).toBe(false)
    expect(d.income.some((l) => l.service.trim().toUpperCase() === 'PDI')).toBe(false)
  }, 180000)

  it('Monthly Closing (scope=all) no cambia: sus líneas suman el Income by Dealer al centavo', async () => {
    const cc = await (service as any).prepare(admin, q(MONTH, 'all'), allDealers)
    expect(cc.employeeIds).toBeNull()
    // Sin servicios sin «tint» que restar: el descuento es solo lo de las expenses Piecework activas de octubre, de
    // cualquier empleado y servicio (SQL propio; Auto Wax sin % de tax). Sin ninguna, nada.
    const active: { k: string; cents: string }[] = await srs.query(
      `SELECT CONCAT(pw.id_dealer, '|', IF(pw.work_date <= ?, ?, ?)) AS k, ROUND(SUM(pw.amount) * 100) AS cents
         FROM EXP_EXPENSE_PIECEWORK_WO pw JOIN EXP_EXPENSE e ON e.id = pw.id_expense AND e.estado = 1 AND e.id_detailer = ?
        WHERE pw.deleted_at IS NULL AND pw.work_date BETWEEN ? AND ?
        GROUP BY k`,
      [cc.periods[0].hasta, cc.periods[0].desde, cc.periods[1].desde, PROVIDER, cc.periods[0].desde, cc.periods[1].hasta],
    )
    expect((await (service as any).payrollDeduction(cc)).byKey).toEqual(new Map(active.map((r) => [r.k, Number(r.cents)])))
    const lines = await service.incomeLines(cc)
    expect(lines.every((l) => l.tint === null)).toBe(true)
    const byDealer = new Map<number, number>()
    for (const l of lines) byDealer.set(l.dealerId, (byDealer.get(l.dealerId) ?? 0) + l.cents)
    const income = await billing.incomeByDealerForRange(cc.filter)
    const diffs: string[] = []
    for (const [id, r] of income) if ((byDealer.get(id) ?? 0) !== toCents(r.income)) diffs.push(String(id))
    expect(diffs).toEqual([])
    const d = await service.getDealer(admin, NISSAN_MIAMI, q(MONTH, 'all'))
    expect(d.byService).toBeNull()
  }, 300000)

  it('el Excel — By service = modal, ninguna fila en rojo, Report Info con las reglas nuevas', async () => {
    const { res, buffer } = fakeResponse()
    await service.export(admin, q(MONTH), res)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer())
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Report Info', 'Summary', 'By service', 'Income', 'Payroll', 'Expenses'])

    const ws = wb.getWorksheet('By service')!
    const sheetRows: { dealer: string; service: string; vehicles: number; cents: number; red: boolean }[] = []
    ws.eachRow((r, n) => {
      if (n < 3) return
      sheetRows.push({
        dealer: String(r.getCell(1).value),
        service: String(r.getCell(3).value),
        vehicles: Number(r.getCell(4).value),
        cents: toCents(Number(r.getCell(5).value)),
        red: r.getCell(1).font?.color?.argb === THEME.warnFg,
      })
    })
    expect(sheetRows.reduce((a, r) => a + r.cents, 0)).toBe(toCents(summary.total.income))
    expect(sheetRows.every((r) => !r.red && isTintService(r.service))).toBe(true)

    const nissan = summary.rows.find((r) => r.dealerId === NISSAN_MIAMI)!
    const d = await service.getDealer(admin, NISSAN_MIAMI, q(MONTH))
    const fromSheet = sheetRows
      .filter((r) => r.dealer === nissan.dealer)
      .map((r) => [r.service, r.vehicles, r.cents])
      .sort()
    const fromModal = d.byService!.map((r) => [r.service, r.vehicles, toCents(r.amount)]).sort()
    expect(fromSheet).toEqual(fromModal)

    let redIncome = 0
    wb.getWorksheet('Income')!.eachRow((r, n) => {
      if (n >= 3 && r.getCell(1).font?.color?.argb === THEME.warnFg) redIncome++
    })
    expect(redIncome).toBe(0)

    const info: Record<string, string> = {}
    wb.getWorksheet('Report Info')!.eachRow((r) => (info[String(r.getCell(1).value)] = String(r.getCell(2).value)))
    expect(info['Tinters']).toBe('Role name contains «tint»')
    expect(info['Tint services']).toContain(`Only services with «${TINT_SERVICE_FRAGMENT}» in their name`)
    expect(info['Rows in red']).toBeUndefined()
  }, 300000)
})

/**
 * Tema 4 (D6, D10) en Window Tint Closing. Ya no se excluye a los vendors: un tintero cuenta en el Payroll con o sin la
 * marca. Lo que un tintero tiene en una expense Piecework activa se resta de su Payroll y se suma en Expenses, solo la
 * parte de los servicios con «tint» (la de los demás servicios ya la saca el tema 6). Acá las dos lecturas de esas
 * expenses (pieceworkInExpenses, pieceworkServiceLines) se simulan con un monto chico del tintero en Lexus, para no
 * escribir en la copia; su SQL y el alta real los prueba src/features/srs-expense/expense-piecework-integration.spec.ts.
 */
/** Edesman Manolo Sales Morales: tintero con WO en Lexus Palm Beach en octubre. */
const TINTER = 5439

;(ready ? describe : describe.skip)('Window Tint Closing — expense Piecework de un tintero (lecturas simuladas)', () => {
  let moduleRef: TestingModule
  let srs: DataSource
  let service: MonthlyClosingService
  let expenses: ExpenseReportRepository
  let allDealers: string
  let tinters: number[]
  let tinterName: string
  let base: MonthlyClosingDto
  let baseDetail: MonthlyClosingDealerDto
  let after: MonthlyClosingDto
  let afterDetail: MonthlyClosingDealerDto
  let inExpensesSpy: jest.SpyInstance
  let serviceLinesSpy: jest.SpyInstance
  /** El monto simulado (centavos) y el período del tintero en Lexus en que cae. */
  let cents: number
  let periodDesde: string

  const q = (scope: 'all' | 'tint' = 'tint') => ({ month: MONTH, idDealer: allDealers, scope })

  beforeAll(async () => {
    moduleRef = await compileClosingModule()
    srs = moduleRef.get(`${SRS_CONNECTION}DataSource`) as DataSource
    service = moduleRef.get(MonthlyClosingService)
    expenses = moduleRef.get(ExpenseReportRepository, { strict: false })
    allDealers = await companyDealers(srs)
    const t: { id: number }[] = await srs.query(TINTERS_SQL, [PROVIDER, PROVIDER])
    tinters = t.map((r) => Number(r.id))
    const [u]: { nombre: string }[] = await srs.query(`SELECT nombre FROM usuarios WHERE id_usuario = ?`, [TINTER])
    tinterName = u.nombre
    base = await service.getSummary(admin, q())
    baseDetail = await service.getDealer(admin, LEXUS_PALM_BEACH, q())
    const line = baseDetail.payroll.find((l) => l.employee === tinterName && l.amount >= 1)
    if (!line) throw new Error(`${tinterName} no tiene Payroll en Lexus en ${MONTH}`)
    // Menos que su Payroll del período: el piso en 0 no entra en juego.
    cents = Math.min(10000, Math.floor(toCents(line.amount) / 2))
    periodDesde = line.periodDesde
    const lexus = base.rows.find((r) => r.dealerId === LEXUS_PALM_BEACH)!

    inExpensesSpy = jest.spyOn(expenses, 'pieceworkInExpenses').mockImplementation(async (_p, _d, _h, opts = {}) =>
      opts.serviceLike
        ? [{ idDealer: LEXUS_PALM_BEACH, idUsuario: TINTER, workDate: periodDesde, amount: cents / 100, payrollTax: null }]
        : [],
    )
    const pieceworkLine: ExpenseLineRow = {
      id: -1,
      ticketDate: `${MONTH}-20`,
      dealerId: LEXUS_PALM_BEACH,
      dealer: lexus.dealer,
      vendor: tinterName,
      category: 'Piecework',
      amount: (cents / 100).toFixed(2),
      notes: '',
    }
    serviceLinesSpy = jest.spyOn(expenses, 'pieceworkServiceLines').mockResolvedValue([pieceworkLine])
    after = await service.getSummary(admin, q())
    afterDetail = await service.getDealer(admin, LEXUS_PALM_BEACH, q())
  }, 600000)

  afterAll(() => jest.restoreAllMocks())

  it('el tintero cuenta en el Payroll sin mirar la marca vendor', async () => {
    const cc = await (service as any).prepare(admin, q(), allDealers)
    expect(cc.employeeIds).toContain(TINTER)
    expect(cc).not.toHaveProperty('vendorIds')
    expect(sumCents(baseDetail.payroll.filter((l) => l.employee === tinterName).map((l) => l.amount))).toBeGreaterThan(0)
  }, 60000)

  it('las lecturas se piden con los tinteros y solo los servicios con «tint», en los días de los pay periods', () => {
    expect(inExpensesSpy).toHaveBeenCalledWith(PROVIDER, '2026-10-01', '2026-10-30', {
      employeeIds: tinters,
      serviceLike: TINT_SERVICE_FRAGMENT,
    })
    expect(serviceLinesSpy).toHaveBeenCalledWith(
      expect.objectContaining({ idDealerProvider: PROVIDER, from: `${MONTH}-01`, to: `${MONTH}-31`, deleted: false }),
      tinters,
      TINT_SERVICE_FRAGMENT,
    )
  })

  it('Lexus: el Payroll baja el monto y Expenses sube lo mismo; Income, Vehicles y los demás dealers, igual', () => {
    const before = base.rows.find((r) => r.dealerId === LEXUS_PALM_BEACH)!
    const now = after.rows.find((r) => r.dealerId === LEXUS_PALM_BEACH)!
    expect(toCents(before.payroll) - toCents(now.payroll)).toBe(cents)
    expect(toCents(now.expenses) - toCents(before.expenses)).toBe(cents)
    expect({ income: now.income, vehicles: now.vehicles, profit: now.profit }).toEqual({
      income: before.income,
      vehicles: before.vehicles,
      profit: before.profit,
    })
    const others = (mc: MonthlyClosingDto) => mc.rows.filter((r) => r.dealerId !== LEXUS_PALM_BEACH)
    expect(others(after)).toEqual(others(base))
    expect(toCents(base.total.payroll) - toCents(after.total.payroll)).toBe(cents)
    expect(toCents(after.total.expenses) - toCents(base.total.expenses)).toBe(cents)
    expect(after.withoutDealer).toEqual(base.withoutDealer)
  })

  it('detalle de Lexus: el tintero baja el monto en su período, el Payroll suma la fila y Expenses trae la línea Piecework', () => {
    const tinterIn = (d: MonthlyClosingDealerDto) =>
      sumCents(d.payroll.filter((l) => l.employee === tinterName && l.periodDesde === periodDesde).map((l) => l.amount))
    expect(tinterIn(baseDetail) - tinterIn(afterDetail)).toBe(cents)
    const now = after.rows.find((r) => r.dealerId === LEXUS_PALM_BEACH)!
    expect(sumCents(afterDetail.payroll.map((l) => l.amount))).toBe(toCents(now.payroll))
    expect(sumCents(afterDetail.expenses.map((l) => l.amount))).toBe(toCents(now.expenses))
    expect(afterDetail.expenses).toEqual(
      expect.arrayContaining([expect.objectContaining({ vendor: tinterName, category: 'Piecework', amount: cents / 100 })]),
    )
    expect(afterDetail.income).toEqual(baseDetail.income)
    expect(afterDetail.byService).toEqual(baseDetail.byService)
  })

  it('Monthly Closing (scope=all) pide las expenses Piecework de todos, sin filtro de servicio, y no suma líneas aparte', async () => {
    inExpensesSpy.mockClear()
    serviceLinesSpy.mockClear()
    const cc = await (service as any).prepare(admin, q('all'), allDealers)
    await (service as any).payrollDeduction(cc)
    expect(inExpensesSpy).toHaveBeenCalledWith(PROVIDER, '2026-10-01', '2026-10-30', {})
    await service.expenseLines(cc)
    expect(serviceLinesSpy).not.toHaveBeenCalled()
  }, 120000)
})
