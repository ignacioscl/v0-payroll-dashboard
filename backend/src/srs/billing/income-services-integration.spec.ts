/**
 * Income by Dealer por servicio contra la copia local de PROD (`srssui5_srs_20261107` en 127.0.0.1:3307): I1–I6 de
 * plans/plan-income-by-dealer-por-servicio/PLAN.md T6. Solo lecturas. Se salta solo, con aviso, si la base no es la
 * copia local. Los números fijos son los del Excel que aprobó GC (plans/plan-excel-gc-por-servicio/PLAN.md §4 B y C);
 * en el código de PRO no hay nada fijo.
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
import { SrsMonthlyClosingModule } from 'src/srs/monthly-closing/monthly-closing.module'
import { MonthlyClosingService } from 'src/srs/monthly-closing/service/monthly-closing.service'
import { toCents } from 'src/srs/shared/kpi/srs-kpi-cents'
import { buildSrsKpiFilter } from 'src/srs/shared/kpi/srs-kpi-filter'
import type { SrsKpiQueryDto } from 'src/srs/shared/kpi/srs-kpi-query.dto'
import { SrsBillingModule } from './srs-billing.module'
import { BillingKpiService, splitRangeByYear } from './service/billing-kpi.service'
import { BillingKpiRepository } from './repository/billing-kpi.repository'
import type { IncomeByDealerDto, IncomeServicesByDealerDto } from './dto/billing-kpi.dto'

const LOCAL_COPY = 'srssui5_srs_20261107'
const ready = process.env.DB_DATABASE === LOCAL_COPY && process.env.DB_PORT === '3307'
if (!ready) console.warn(`SKIPPED income-services-integration.spec.ts: la base no es la copia local ${LOCAL_COPY} en 127.0.0.1:3307`)
const describeIf = ready ? describe : describe.skip

const GC = 188 // GC Installations
const AUTO_WAX = 79
const AUTO_WAX_ADMIN = 76
const AUTO_WAX_RESTRICTED = 4972 // ve 408, no ve 86 (monthly-closing-integration.spec.ts)
const DEALER_NOT_SEEN = 86
const GC_DEALER_FOR_AUTO_WAX = 186 // dealer de GC, no de Auto Wax
// Los 5 dealers del Excel: Audi Pembroke Pine, BMW & Mini of FTL, BMW Pines, Holman Porsche NM, Bentley Fort Lauderdale.
const EXCEL_DEALERS = [196, 200, 755, 902, 199]
const BENTLEY = 199

const Y2025 = { fechaDesde: '2025-01-01', fechaHasta: '2025-12-31' }
const Y2026 = { fechaDesde: '2026-01-01', fechaHasta: '2026-10-31' }

/** Excel v3 §4 B: por dealer, WO Qty · Vehicles · WO Income. */
const EXCEL_B: Record<number, Record<number, [number, number, number]>> = {
  2025: {
    755: [6043, 4712, 484770.0],
    199: [9288, 3255, 504724.0],
    200: [5151, 4302, 402995.0],
    196: [2552, 2123, 226805.0],
  },
  2026: {
    199: [7951, 3077, 445789.0],
    755: [4978, 3960, 420725.0],
    200: [4046, 3602, 348675.0],
    196: [1918, 1771, 180535.0],
    902: [2002, 1506, 133660.0],
  },
}
/** Excel v3 §4 B y Summary: total del año de los 5 dealers. */
const EXCEL_YEAR = {
  2025: { woQty: 23034, vehicles: 13594, woIncome: 1619294.0, income: 1770096.99 },
  2026: { woQty: 20895, vehicles: 13412, woIncome: 1529384.0, income: 1613186.97 },
}

const ctxGc: SrsContext = { idUsuario: 0, idUsuarioRolrel: null, idRol: 2, idDealerProvider: GC, isUserDealer: false, isActive: true }
const ctxAutoWax: SrsContext = { ...ctxGc, idUsuario: AUTO_WAX_ADMIN, idDealerProvider: AUTO_WAX }
const ctxRestricted: SrsContext = { ...ctxAutoWax, idUsuario: AUTO_WAX_RESTRICTED, idRol: 5 }

/** Por año: dealerId → centavos de Income, de un lado y del otro; devuelve las diferencias. */
function centsDiffs(services: IncomeServicesByDealerDto, income: IncomeByDealerDto): string[] {
  const diffs: string[] = []
  for (const y of income.years) {
    const sy = services.years.find((x) => x.year === y.year)
    const got = new Map((sy?.dealers ?? []).map((d) => [d.dealerId, toCents(d.income)]))
    for (const r of y.dealers) {
      if (got.get(r.dealerId) !== toCents(r.income)) diffs.push(`${y.year} ${r.dealerId}: services ${(got.get(r.dealerId) ?? 0) / 100} vs income ${r.income}`)
      got.delete(r.dealerId)
    }
    for (const [id, c] of got) diffs.push(`${y.year} ${id}: services ${c / 100}, not in Income by Dealer`)
  }
  return diffs
}

describeIf('Income by Dealer por servicio — integración contra la copia local (solo lectura)', () => {
  let moduleRef: TestingModule
  let srs: DataSource
  let service: BillingKpiService
  let billing: BillingKpiRepository
  let closing: MonthlyClosingService
  let gcDealers: string

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
        SrsMonthlyClosingModule,
      ],
    })
      // El permiso se prueba en billing-kpi-income-services.spec.ts; acá, empresa, alcance y plata.
      .overrideProvider(SrsPermissionRepository)
      .useValue({ userHasRolAccion: async () => true, assertRolAccion: async () => undefined })
      .compile()
    srs = moduleRef.get(`${SRS_CONNECTION}DataSource`) as DataSource
    service = moduleRef.get(BillingKpiService)
    billing = moduleRef.get(BillingKpiRepository)
    closing = moduleRef.get(MonthlyClosingService)
    const rows: { id: number }[] = await srs.query(
      `SELECT c.id FROM CONTRATISTA c WHERE c.estado = 1 AND c.tipo_empresa = 1
         AND EXISTS (SELECT 1 FROM DEALER_REL dr WHERE dr.id_dealer_customer = c.id AND dr.id_dealer_provider = ?)
       ORDER BY c.id`,
      [GC],
    )
    gcDealers = rows.map((r) => r.id).join(',')
  }, 60000)

  afterAll(async () => {
    await moduleRef?.close()
  })

  /**
   * El endpoint acepta un dealer y un año por pedido; para comparar todos los dealers juntos se llama al repository con
   * el mismo filtro de sesión que arma el service.
   */
  const allAtOnce = async (ctx: SrsContext, q: SrsKpiQueryDto): Promise<IncomeServicesByDealerDto> => {
    const filter = buildSrsKpiFilter(ctx, q)
    return { years: await billing.getIncomeServicesByDealer(filter, splitRangeByYear(filter.fechaDesde, filter.fechaHasta), false) }
  }

  it('el endpoint rechaza varios dealers o varios años en un pedido', async () => {
    await expect(service.getIncomeServicesByDealer(ctxGc, { ...Y2026, idDealer: gcDealers })).rejects.toThrow(/one dealer/)
    await expect(
      service.getIncomeServicesByDealer(ctxGc, { fechaDesde: Y2025.fechaDesde, fechaHasta: Y2026.fechaHasta, idDealer: '199' }),
    ).rejects.toThrow(/one dealer/)
  })

  it('I1: cada dealer de GC, 2025 y 2026 YTD, al centavo contra Income by Dealer', async () => {
    const q = { fechaDesde: Y2025.fechaDesde, fechaHasta: Y2026.fechaHasta, idDealer: gcDealers }
    const income = await service.getIncomeByDealer(ctxGc, q)
    const services = await allAtOnce(ctxGc, q)
    expect(income.years.map((y) => y.year)).toEqual([2025, 2026])
    expect(income.years.every((y) => y.dealers.length > 0)).toBe(true)
    expect(centsDiffs(services, income)).toEqual([])
  }, 600000)

  describe('los 5 dealers del Excel', () => {
    const results: Record<number, IncomeServicesByDealerDto['years'][number]> = {}
    beforeAll(async () => {
      for (const [year, range] of [
        [2025, Y2025],
        [2026, Y2026],
      ] as const) {
        const r = await allAtOnce(ctxGc, { ...range, idDealer: EXCEL_DEALERS.join(',') })
        results[year] = r.years[0]
      }
    }, 300000)

    it('I2: WO Qty, Vehicles y WO Income de cada dealer, y los totales del año, = el Excel', () => {
      for (const year of [2025, 2026] as const) {
        const got = Object.fromEntries(results[year].dealers.map((d) => [d.dealerId, [d.wo.qty, d.wo.vehicles, d.wo.income]]))
        expect(got).toEqual(EXCEL_B[year])
        const y = results[year]
        expect({ woQty: y.woQty, vehicles: y.vehicles, woIncome: y.woIncome, income: y.income }).toEqual(EXCEL_YEAR[year])
        // Vehicles del año es el distinto del conjunto: no la suma de los dealers.
        expect(y.vehicles).toBeLessThanOrEqual(y.dealers.reduce((a, d) => a + d.wo.vehicles, 0))
        // Cada dealer: secciones = su Income.
        for (const d of y.dealers) {
          expect(toCents(d.wo.income) + toCents(d.generic.income) + toCents(d.ttk.income)).toBe(toCents(d.income))
          expect(d.wo.services.reduce((a, s) => a + toCents(s.income), 0)).toBe(toCents(d.wo.income))
        }
      }
    })

    it('I3: la suma de los 5 = la tarjeta Income de Business KPIs', async () => {
      for (const [year, range] of [
        [2025, Y2025],
        [2026, Y2026],
      ] as const) {
        const b = await service.getBillingKpis(ctxGc, { ...range, idDealer: EXCEL_DEALERS.join(',') })
        const card = toCents(b.woInvoicedValue) + toCents(b.ttkInvoicedValue) + toCents(b.genericInvoicedValue) + toCents(b.unbilledValue)
        expect(card).toBe(toCents(results[year].income))
      }
    }, 300000)

    it('I3: Bentley 2025 = la suma de los 12 meses del Monthly Closing (511,076.50)', async () => {
      let cents = 0
      for (let m = 1; m <= 12; m++) {
        const month = `2025-${String(m).padStart(2, '0')}`
        const mc = await closing.getSummary(ctxGc, { month, idDealer: String(BENTLEY) })
        cents += toCents(mc.rows.find((r) => r.dealerId === BENTLEY)?.income ?? 0)
      }
      const bentley = results[2025].dealers.find((d) => d.dealerId === BENTLEY)!
      expect(cents).toBe(toCents(bentley.income))
      expect(bentley.income).toBe(511076.5)
    }, 600000)
  })

  it('I4: con «Filter by completion date», GC 2026 YTD, cada dealer al centavo', async () => {
    const q = { ...Y2026, idDealer: gcDealers, filterDateDone: true }
    const income = await service.getIncomeByDealer(ctxGc, q)
    const services = await allAtOnce(ctxGc, q)
    expect(centsDiffs(services, income)).toEqual([])
  }, 600000)

  it('I5: TTK de Auto Wax, septiembre 2026: un dealer con TTK al centavo y con la sección TTK', async () => {
    const sep = { fechaDesde: '2026-09-01', fechaHasta: '2026-09-30' }
    const rows: { id: number }[] = await srs.query(
      `SELECT c.id FROM CONTRATISTA c WHERE c.estado = 1 AND c.tipo_empresa = 1
         AND EXISTS (SELECT 1 FROM DEALER_REL dr WHERE dr.id_dealer_customer = c.id AND dr.id_dealer_provider = ?)`,
      [AUTO_WAX],
    )
    const lines = await billing.incomeLinesForRange({
      idDealerProvider: AUTO_WAX,
      idUsuario: AUTO_WAX_ADMIN,
      dealerIds: rows.map((r) => r.id),
      ...sep,
      includeZero: false,
      filterDateDone: false,
      skipDealerRestriction: true,
      includeRemovedDealers: false,
    })
    const ttkCents = new Map<number, number>()
    for (const l of lines) if (l.kind === 'ttk') ttkCents.set(l.dealerId, (ttkCents.get(l.dealerId) ?? 0) + toCents(l.amount))
    const [dealerId] = [...ttkCents].sort((a, b) => b[1] - a[1])[0]
    const q = { ...sep, idDealer: String(dealerId) }
    const income = await service.getIncomeByDealer(ctxAutoWax, q)
    const services = await service.getIncomeServicesByDealer(ctxAutoWax, q)
    expect(centsDiffs(services, income)).toEqual([])
    const d = services.years[0].dealers.find((x) => x.dealerId === dealerId)!
    expect(d.ttk.income).toBeGreaterThan(0)
    expect(d.ttk.lines.length).toBeGreaterThan(0)
  }, 300000)

  it('I6: aislamiento — Auto Wax pidiendo un dealer de GC, y el usuario restringido pidiendo el dealer que no ve', async () => {
    const sep = { fechaDesde: '2026-09-01', fechaHasta: '2026-09-30' }
    const other = await service.getIncomeServicesByDealer(ctxAutoWax, { ...sep, idDealer: String(GC_DEALER_FOR_AUTO_WAX) })
    expect(other.years[0].dealers).toEqual([])
    const restricted = await service.getIncomeServicesByDealer(ctxRestricted, { ...sep, idDealer: String(DEALER_NOT_SEEN) })
    expect(restricted.years[0].dealers).toEqual([])
  }, 300000)
})
