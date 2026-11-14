/**
 * Income by Dealer: facturas TTK y autos de cada servicio, contra la copia local de PROD (`srssui5_srs_20261107` en
 * 127.0.0.1:3307): I1–I3 de plans/plan-income-by-dealer-ttk-y-autos/PLAN.md T7. Solo lecturas. Se salta solo, con aviso, si
 * la base no es la copia local. Los dealers se buscan por nombre; los números fijos son los certificados en el plan y en la
 * review de GPT (Pompano, octubre 2026). En el código de PRO no hay nada fijo.
 */
import 'dotenv/config'
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
import { toCents } from 'src/srs/shared/kpi/srs-kpi-cents'
import { SrsBillingModule } from './srs-billing.module'
import { BillingKpiService } from './service/billing-kpi.service'

const LOCAL_COPY = 'srssui5_srs_20261107'
const ready = process.env.DB_DATABASE === LOCAL_COPY && process.env.DB_PORT === '3307'
if (!ready) console.warn(`SKIPPED income-ttk-vehicles-integration.spec.ts: la base no es la copia local ${LOCAL_COPY} en 127.0.0.1:3307`)
const describeIf = ready ? describe : describe.skip

const GC = 188
const AUTO_WAX = 79
const AUTO_WAX_ADMIN = 76 // usuario
const AUTO_WAX_RESTRICTED = 4972 // ve 408, no ve 86 (monthly-closing-integration.spec.ts)
const DEALER_NOT_SEEN = 86
const GC_DEALER_FOR_AUTO_WAX = 186
const OCT = { fechaDesde: '2026-10-01', fechaHasta: '2026-10-31' }

const ctxGc: SrsContext = { idUsuario: 0, idUsuarioRolrel: null, idRol: 2, idDealerProvider: GC, isUserDealer: false, isActive: true }
const ctxAutoWax: SrsContext = { ...ctxGc, idUsuario: AUTO_WAX_ADMIN, idDealerProvider: AUTO_WAX }
const ctxRestricted: SrsContext = { ...ctxAutoWax, idUsuario: AUTO_WAX_RESTRICTED, idRol: 5 }

describeIf('Income by Dealer: facturas TTK y autos — integración contra la copia local (solo lectura)', () => {
  let moduleRef: TestingModule
  let srs: DataSource
  let service: BillingKpiService
  let pompano: number

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
        SrsBillingModule,
      ],
    })
      // El permiso se prueba en billing-kpi-income-services.spec.ts; acá, empresa, alcance y plata.
      .overrideProvider(SrsPermissionRepository)
      .useValue({ userHasRolAccion: async () => true, assertRolAccion: async () => undefined })
      .compile()
    srs = moduleRef.get(`${SRS_CONNECTION}DataSource`) as DataSource
    service = moduleRef.get(BillingKpiService)
    const rows: { id: number }[] = await srs.query(
      `SELECT c.id FROM CONTRATISTA c
        WHERE GET_DEALER_NAME_BY_PROVIDER(?, c.id) = 'AutoNation Mercedes-Benz of Pompano'
          AND EXISTS (SELECT 1 FROM DEALER_REL dr WHERE dr.id_dealer_customer = c.id AND dr.id_dealer_provider = ?)`,
      [AUTO_WAX, AUTO_WAX],
    )
    expect(rows).toHaveLength(1)
    pompano = rows[0].id
  }, 60000)

  afterAll(async () => {
    await moduleRef?.close()
  })

  it('I1: TTK de Pompano, octubre 2026, por factura: 15 facturas que suman el TTK al centavo', async () => {
    const r = await service.getIncomeServicesByDealer(ctxAutoWax, { ...OCT, idDealer: String(pompano) })
    const d = r.years[0].dealers.find((x) => x.dealerId === pompano)!
    const t = d.ttk
    expect(t.income).toBe(51079.07)
    expect(t.invoices).toHaveLength(15)
    expect(t.invoices.reduce((a, i) => a + toCents(i.income), 0)).toBe(toCents(t.income))
    for (const i of t.invoices) expect(i.employees.reduce((a, e) => a + toCents(e.income), 0)).toBe(toCents(i.income))
    // Por período y después por número (D3).
    const keys = t.invoices.map((i) => `${i.dateFrom}|${i.nro}`)
    expect(keys).toEqual([...keys].sort())
    const m = t.invoices.find((i) => i.nro === 'MBP22166')!
    expect([m.dateFrom, m.dateTo, m.income, m.employees.length]).toEqual(['2026-10-05', '2026-10-11', 5591.7, 6])
    // Consulta independiente: las facturas TTK activas del dealer con ponchadas en el rango, y sus empleados.
    const indep: { nro: string; emps: number }[] = await srs.query(
      `SELECT s.full_nro AS nro, COUNT(DISTINCT tew.id_author) AS emps
         FROM INVOICE_STATEMENT s
         JOIN INVOICE_STATEMENT_INV_REL isir ON isir.id_statement = s.id AND isir.id_employee_work IS NOT NULL
              AND IFNULL(isir.only_timecard, 0) = 0
         JOIN TTK_EMPLOYEE_WORK tew ON tew.id = isir.id_employee_work AND tew.estado = 1
        WHERE s.estado = 1 AND s.id_dealer_provider = ? AND s.statement_type = 5 AND tew.id_dealer = ?
          AND tew.punch_in >= ? AND tew.punch_in < DATE_ADD(?, INTERVAL 1 DAY) AND isir.amount <> 0
        GROUP BY s.id ORDER BY s.full_nro`,
      [AUTO_WAX, pompano, OCT.fechaDesde, OCT.fechaHasta],
    )
    expect(t.invoices.map((i) => [i.nro, i.employees.length]).sort()).toEqual(indep.map((x) => [x.nro, Number(x.emps)]))
    // El agrupado por empleado de hoy (lo lee el Export) no cambió.
    expect(t.lines.reduce((a, l) => a + toCents(l.income), 0)).toBe(toCents(t.income))
  }, 120000)

  it('I2: los autos de cada servicio cuadran con su fila — Pompano octubre 2026 y Bentley (GC) octubre 2026', async () => {
    const bentley: { id: number }[] = await srs.query(
      `SELECT c.id FROM CONTRATISTA c WHERE GET_DEALER_NAME_BY_PROVIDER(?, c.id) LIKE 'Bentley%'
          AND EXISTS (SELECT 1 FROM DEALER_REL dr WHERE dr.id_dealer_customer = c.id AND dr.id_dealer_provider = ?)`,
      [GC, GC],
    )
    for (const [ctx, dealerId] of [
      [ctxAutoWax, pompano],
      [ctxGc, bentley[0].id],
    ] as const) {
      const q = { ...OCT, idDealer: String(dealerId) }
      const row = (await service.getIncomeServicesByDealer(ctx, q)).years[0].dealers.find((x) => x.dealerId === dealerId)!
      expect(row.wo.services.length).toBeGreaterThan(0)
      for (const s of row.wo.services) {
        const v = await service.getIncomeServiceVehicles(ctx, { ...q, service: s.service })
        expect([v.rows.length, v.vehicles, toCents(v.qty * 1), toCents(v.income)]).toEqual([
          s.vehicles,
          s.vehicles,
          toCents(s.qty),
          toCents(s.income),
        ])
        expect(v.rows.reduce((a, r) => a + toCents(r.income), 0)).toBe(toCents(s.income))
        expect(v.rows.reduce((a, r) => a + toCents(r.qty), 0)).toBe(toCents(s.qty))
        expect(v.rows.every((r) => r.vin && r.wos.length > 0)).toBe(true)
        // Cada WO con su fecha, y la fecha dentro del rango pedido (es la que el reporte usa para el período).
        expect(
          v.rows.every(
            (r) =>
              r.woDates.length === r.wos.length &&
              r.woDates.every((d) => d >= v.fechaDesde && d <= v.fechaHasta),
          ),
        ).toBe(true)
      }
    }
    const fd = await service.getIncomeServiceVehicles(ctxAutoWax, { ...OCT, idDealer: String(pompano), service: 'Full Detail' })
    expect([fd.rows.length, fd.qty, fd.income]).toEqual([76, 76, 7524])
    expect(fd.rows.every((r) => r.make !== '')).toBe(true)
  }, 600000)

  it('I3: aislamiento — Auto Wax pidiendo un dealer de GC, y el usuario restringido pidiendo el dealer que no ve', async () => {
    const other = await service.getIncomeServiceVehicles(ctxAutoWax, {
      ...OCT,
      idDealer: String(GC_DEALER_FOR_AUTO_WAX),
      service: 'Full Detail',
    })
    expect(other.rows).toEqual([])
    const restricted = await service.getIncomeServiceVehicles(ctxRestricted, {
      ...OCT,
      idDealer: String(DEALER_NOT_SEEN),
      service: 'Full Detail',
    })
    expect(restricted.rows).toEqual([])
    expect(restricted.income).toBe(0)
  }, 300000)
})
