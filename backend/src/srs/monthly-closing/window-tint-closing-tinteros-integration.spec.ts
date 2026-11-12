/**
 * Window Tint Closing con la regla del tintero (plans/plan-window-tint-closing-tint-y-servicios, P1–P5) contra la
 * copia local de PROD del 07/11 (`srssui5_srs_20261107` en 127.0.0.1:3307). Solo lecturas. Se salta solo, con aviso,
 * si la base no es esa copia.
 *
 * Regla: cuentan todos los servicios de las WO asignadas a un tintero (rol con «tint» y Piecework o Piecework by % en
 * la ficha); Vehicles solo los servicios con «tint»; los demás se marcan. D1 (Payroll) y D2 (Generic) siguen como
 * hasta ahora mientras Auto Wax no conteste: Payroll con todos los tipos de pago de los tinteros, y las líneas libres
 * de Generic con «tint» cuentan.
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
import { PIECEWORK_TYPE_IDS } from 'src/srs/payroll/snapshot/payment-type-ids'
import { THEME } from 'src/srs/shared/export/xlsx-theme'
import { SrsMonthlyClosingModule } from './monthly-closing.module'
import { MonthlyClosingService } from './service/monthly-closing.service'
import { isTintService, toCents } from './monthly-closing-math'

const LOCAL_COPY = 'srssui5_srs_20261107'
const ready = process.env.DB_DATABASE === LOCAL_COPY && process.env.DB_PORT === '3307'
if (!ready) {
  console.warn(`SKIPPED window-tint-closing-tinteros-integration.spec.ts: la base no es la copia local ${LOCAL_COPY} en 127.0.0.1:3307`)
}
const describeIf = ready ? describe : describe.skip

const PROVIDER = 79 // Auto Wax
const ADMIN_USER = 76 // Admin Company de Auto Wax
const NISSAN_MIAMI = 744 // AutoNation Nissan Miami
const admin: SrsContext = { idUsuario: ADMIN_USER, idUsuarioRolrel: null, idRol: 2, idDealerProvider: PROVIDER, isUserDealer: false, isActive: true }

const sumCents = (xs: number[]) => xs.reduce((a, x) => a + toCents(x), 0)

/**
 * Consulta independiente (medicion/por-dealer.sql del plan), por dealer: los tinteros y todos los servicios de sus WO
 * del mes. Monto = price × qty, sin el descuento de la invoice.
 */
const TINTERS_SQL = `
  SELECT DISTINCT ur.id_usuario AS id
  FROM USUARIO_ROL_REL ur
  JOIN ROL r ON r.id_rol = ur.id_rol
  JOIN usuarios u ON u.id_usuario = ur.id_usuario
  WHERE r.id_compania_owner = ? AND u.id_contratista_owner = ? AND LOWER(r.nombre) LIKE '%tint%'
    AND EXISTS (SELECT 1 FROM USUARIO_PAYROLL_REL p WHERE p.id_usuario = ur.id_usuario AND p.id_payment_type IN (?, ?))
  ORDER BY id`

const BY_DEALER_SQL = `
  SELECT d.id_dealer AS dealerId,
         ROUND(SUM(isr.price * IFNULL(isr.qty, 1)), 2) AS income,
         ROUND(SUM(CASE WHEN LOWER(s.nombre) NOT LIKE '%tint%' THEN isr.price * IFNULL(isr.qty, 1) ELSE 0 END), 2) AS nonTint,
         SUM(CASE WHEN LOWER(s.nombre) LIKE '%tint%' THEN IFNULL(isr.qty, 1) ELSE 0 END) AS vehicles
  FROM INVOICE i
  JOIN DEPARTMENT d ON d.id = i.id_department
  JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
  JOIN INVOICE_SERVICE s ON s.id = isr.id_service_invoice
  WHERE i.estado = 1 AND i.id_dealer_provider = ? AND i.fecha_alta >= ? AND i.fecha_alta < DATE_ADD(?, INTERVAL 1 DAY)
    AND EXISTS (SELECT 1 FROM INVOICE_EMPLOYEE_REL ier WHERE ier.id_invoice = i.id AND ier.id_usuario IN (__TINTERS__))
  GROUP BY d.id_dealer`

function fakeResponse(): { res: Response; buffer: () => Buffer } {
  const chunks: Buffer[] = []
  const stream = new PassThrough()
  stream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)))
  const res = Object.assign(stream, { setHeader: () => undefined })
  return { res: res as unknown as Response, buffer: () => Buffer.concat(chunks) }
}

describeIf('Window Tint Closing — regla del tintero, contra la copia local (solo lectura)', () => {
  let moduleRef: TestingModule
  let srs: DataSource
  let service: MonthlyClosingService
  let billing: BillingKpiRepository
  let allDealers: string
  let tinters: number[]

  const q = (month: string, scope: 'all' | 'tint' = 'tint') => ({ month, idDealer: allDealers, scope })

  async function independent(month: string) {
    const [y, m] = month.split('-').map(Number)
    const first = `${month}-01`
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
    const sql = BY_DEALER_SQL.replace('__TINTERS__', tinters.map(() => '?').join(','))
    const rows: { dealerId: number; income: string; nonTint: string; vehicles: string }[] = await srs.query(sql, [
      PROVIDER,
      first,
      last,
      ...tinters,
    ])
    return new Map(rows.map((r) => [Number(r.dealerId), { income: Number(r.income), nonTint: Number(r.nonTint), vehicles: Number(r.vehicles) }]))
  }

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
    const t: { id: number }[] = await srs.query(TINTERS_SQL, [PROVIDER, PROVIDER, ...PIECEWORK_TYPE_IDS])
    tinters = t.map((r) => Number(r.id))
  }, 60000)

  afterAll(async () => {
    await moduleRef?.close()
  })

  it('P4: los tinteros del reporte son los de la consulta independiente (rol «tint» y Piecework, de la empresa)', async () => {
    const cc = await (service as any).prepare(admin, q('2026-10'), allDealers)
    expect(cc.employeeIds).toEqual(tinters)
    expect(tinters.length).toBeGreaterThan(0)
    // Con rol «tint» y sin Piecework en la ficha: no entra.
    const sinPiecework: { id: number }[] = await srs.query(
      `SELECT DISTINCT ur.id_usuario AS id FROM USUARIO_ROL_REL ur JOIN ROL r ON r.id_rol = ur.id_rol
       JOIN usuarios u ON u.id_usuario = ur.id_usuario
       WHERE r.id_compania_owner = ? AND u.id_contratista_owner = ? AND LOWER(r.nombre) LIKE '%tint%'
         AND NOT EXISTS (SELECT 1 FROM USUARIO_PAYROLL_REL p WHERE p.id_usuario = ur.id_usuario AND p.id_payment_type IN (?, ?))`,
      [PROVIDER, PROVIDER, ...PIECEWORK_TYPE_IDS],
    )
    expect(sinPiecework.length).toBeGreaterThan(0)
    for (const r of sinPiecework) expect(cc.employeeIds).not.toContain(Number(r.id))
    // Ninguno es de otra empresa.
    const owners: { owner: number }[] = await srs.query(
      `SELECT DISTINCT u.id_contratista_owner AS owner FROM usuarios u WHERE u.id_usuario IN (${tinters.map(() => '?').join(',')})`,
      tinters,
    )
    expect(owners.map((o) => Number(o.owner))).toEqual([PROVIDER])
  }, 60000)

  for (const month of ['2026-08', '2026-10']) {
    describe(month, () => {
      it('P1: por dealer, el Income de WO y Vehicles = la consulta independiente (sin descuento: se explica la diferencia)', async () => {
        const cc = await (service as any).prepare(admin, q(month), allDealers)
        const lines = await service.incomeLines(cc)
        const ind = await independent(month)
        const got = new Map<number, { income: number; nonTint: number; vehicles: number }>()
        for (const l of lines) {
          if (l.kind !== 'wo' && l.kind !== 'woUnbilled') continue
          const g = got.get(l.dealerId) ?? { income: 0, nonTint: 0, vehicles: 0 }
          g.income += l.cents
          if (!l.tint) g.nonTint += l.cents
          else g.vehicles += l.qty
          got.set(l.dealerId, g)
        }
        const diffs: string[] = []
        for (const id of new Set([...ind.keys(), ...got.keys()])) {
          const a = ind.get(id) ?? { income: 0, nonTint: 0, vehicles: 0 }
          const b = got.get(id) ?? { income: 0, nonTint: 0, vehicles: 0 }
          if (toCents(a.income) !== b.income || toCents(a.nonTint) !== b.nonTint || a.vehicles !== b.vehicles) {
            diffs.push(`${id}: sql ${a.income}/${a.nonTint}/${a.vehicles} vs report ${b.income / 100}/${b.nonTint / 100}/${b.vehicles}`)
          }
        }
        expect(diffs).toEqual([])
        // Nunca TTK ni ponchadas de Generic; las Generic libres, solo con «tint» (D2).
        expect(lines.some((l) => l.kind === 'ttk' || l.kind === 'genericPunch')).toBe(false)
        expect(lines.filter((l) => l.kind === 'genericFree').every((l) => isTintService(l.service))).toBe(true)
      }, 180000)

      it('P5: cada dealer — By service suma su Income, Income suma la fila, Vehicles = Qty de los servicios con «tint»', async () => {
        const sum = await service.getSummary(admin, q(month))
        for (const row of sum.rows.filter((r) => r.income !== 0)) {
          const d = await service.getDealer(admin, row.dealerId, q(month))
          expect(d.byService).not.toBeNull()
          expect(sumCents(d.byService!.map((r) => r.amount))).toBe(toCents(row.income))
          expect(sumCents(d.income.map((l) => l.total))).toBe(toCents(row.income))
          expect(sumCents(d.payroll.map((l) => l.amount))).toBe(toCents(row.payroll))
          expect(d.byService!.filter((r) => r.tint).reduce((a, r) => a + r.vehicles, 0)).toBe(row.vehicles)
          expect(row.nonTint).toBe(d.income.some((l) => l.warn === true))
          // En rojo solo lo que no dice «tint» y tiene importe (11/11/2026: un servicio en $0 no se marca).
          expect(d.income.every((l) => l.warn === (l.tint === false && toCents(l.total) !== 0))).toBe(true)
          expect(d.byService!.every((r) => r.warn === (!r.tint && toCents(r.amount) !== 0))).toBe(true)
        }
        expect(sum.total.nonTint).toBe(sum.rows.some((r) => r.nonTint))
      }, 600000)
    })
  }

  it('octubre: Nissan Miami en rojo, con PDI 113 marcado en By service', async () => {
    const sum = await service.getSummary(admin, q('2026-10'))
    const nissan = sum.rows.find((r) => r.dealerId === NISSAN_MIAMI)!
    expect(nissan.nonTint).toBe(true)
    const d = await service.getDealer(admin, NISSAN_MIAMI, q('2026-10'))
    const pdi = d.byService!.filter((r) => r.service.trim().toUpperCase() === 'PDI')
    expect(pdi.reduce((a, r) => a + r.vehicles, 0)).toBe(113)
    expect(pdi.every((r) => r.tint === false)).toBe(true)
    expect(d.income.filter((l) => l.service.trim().toUpperCase() === 'PDI').every((l) => l.tint === false)).toBe(true)
    expect(pdi.every((r) => r.warn)).toBe(true)
  }, 180000)

  it('octubre: Lexus Palm Beach ya no va en rojo — sus únicos servicios sin «tint» son dos «Others» de $0.00 (11/11/2026)', async () => {
    const sum = await service.getSummary(admin, q('2026-10'))
    const lexus = sum.rows.find((r) => /Lexus of Palm Beach/i.test(r.dealer))!
    expect(lexus).toBeDefined()
    const d = await service.getDealer(admin, lexus.dealerId, q('2026-10'))
    const others = d.income.filter((l) => l.tint === false)
    expect(others.length).toBeGreaterThan(0)
    expect(others.every((l) => l.total === 0 && l.warn === false)).toBe(true)
    expect(lexus.nonTint).toBe(false)
  }, 180000)

  it('P3: Payroll de octubre = $9,635.00 (los tinteros, todos los tipos de pago: D1 sin contestar)', async () => {
    const sum = await service.getSummary(admin, q('2026-10'))
    expect(sum.total.payroll).toBe(9635)
  }, 180000)

  it('P2: Monthly Closing (scope=all) no cambia: sus líneas suman el Income by Dealer al centavo y no llevan marcas', async () => {
    const cc = await (service as any).prepare(admin, q('2026-10', 'all'), allDealers)
    expect(cc.employeeIds).toBeNull()
    const lines = await service.incomeLines(cc)
    expect(lines.every((l) => l.tint === null)).toBe(true)
    const byDealer = new Map<number, number>()
    for (const l of lines) byDealer.set(l.dealerId, (byDealer.get(l.dealerId) ?? 0) + l.cents)
    const income = await billing.incomeByDealerForRange(cc.filter)
    const diffs: string[] = []
    for (const [id, r] of income) if ((byDealer.get(id) ?? 0) !== toCents(r.income)) diffs.push(String(id))
    expect(diffs).toEqual([])
    const mc = await service.getSummary(admin, q('2026-10', 'all'))
    expect(mc.rows.every((r) => r.nonTint === null)).toBe(true)
    const d = await service.getDealer(admin, NISSAN_MIAMI, q('2026-10', 'all'))
    expect(d.byService).toBeNull()
  }, 300000)

  it('P5/P6: el Excel — By service = modal de cada dealer, filas sin «tint» en rojo, Report Info con las reglas nuevas', async () => {
    const sum = await service.getSummary(admin, q('2026-10'))
    const { res, buffer } = fakeResponse()
    await service.export(admin, q('2026-10'), res)
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
    expect(sheetRows.reduce((a, r) => a + r.cents, 0)).toBe(toCents(sum.total.income))
    expect(sheetRows.every((r) => r.red === (!isTintService(r.service) && r.cents !== 0))).toBe(true)

    const nissan = sum.rows.find((r) => r.dealerId === NISSAN_MIAMI)!
    const d = await service.getDealer(admin, NISSAN_MIAMI, q('2026-10'))
    const fromSheet = sheetRows
      .filter((r) => r.dealer === nissan.dealer)
      .map((r) => [r.service, r.vehicles, r.cents])
      .sort()
    const fromModal = d.byService!.map((r) => [r.service, r.vehicles, toCents(r.amount)]).sort()
    expect(fromSheet).toEqual(fromModal)

    const income = wb.getWorksheet('Income')!
    let redIncome = 0
    income.eachRow((r, n) => {
      if (n >= 3 && r.getCell(1).font?.color?.argb === THEME.warnFg) redIncome++
    })
    expect(redIncome).toBeGreaterThan(0)

    const info: Record<string, string> = {}
    wb.getWorksheet('Report Info')!.eachRow((r) => (info[String(r.getCell(1).value)] = String(r.getCell(2).value)))
    expect(info['Tinters']).toBe('Role name contains «tint» and Piecework payment type')
    expect(info['Rows in red']).toBe(
      'Services without «tint» in their name and an amount other than $0, from work orders assigned to tinters',
    )
  }, 300000)
})
