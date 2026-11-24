/**
 * WO to be Billed (plans/plan-wo-to-be-billed-v0, T11): la lectura de Nest contra la copia local de PROD del 12/11
 * (`srssui5_srs_20261112` en 127.0.0.1:3307). **Solo lee.**
 *
 * 1. La lista y el total de Nest contra la consulta de legacy (`InvoiceDao::getWhere` con lo que manda la solapa,
 *    `api.datatable.php:54-89`), escrita acá aparte: tres dealers, dos rangos, con y sin «Include Zero Value», con
 *    Completed solo y con un servicio. Mismas WO, mismo total.
 * 2. Lista = facturable (D17): para cada dealer e Invoice Type, las WO de la lista son exactamente las de
 *    `pendingLines`; y los dos casos de la copia (WO 4215054 y 4421922) no aparecen con su Invoice Type.
 *
 * Se salta solo, con aviso, si la base no es esa copia.
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
import { WoToBeBilledFilterDto } from './dto/wo-to-be-billed.dto'
import { WoToBeBilledRepository } from './repository/wo-to-be-billed.repository'
import { WoToBeBilledService } from './service/wo-to-be-billed.service'
import { SrsBillingModule } from './srs-billing.module'

const LOCAL_COPY = 'srssui5_srs_20261112'
const ready = process.env.DB_DATABASE === LOCAL_COPY && process.env.DB_PORT === '3307'
if (!ready) {
  console.warn(`SKIPPED wo-to-be-billed-integration.spec.ts: la base no es la copia local ${LOCAL_COPY} en 127.0.0.1:3307.`)
}
const describeIf = ready ? describe : describe.skip

/** Tres empresas internas, su Admin Company y el dealer con más WO pendientes de cada una. */
const CASES = [
  { prov: 79, admin: 76, dealer: 874 },
  { prov: 232, admin: 46, dealer: 594 },
  { prov: 188, admin: 78, dealer: 921 },
] as const
const RANGES = [
  { dateFrom: '2026-10-01', dateTo: '2026-11-12' },
  { dateFrom: '2026-09-01', dateTo: '2026-09-30' },
] as const

const ctxOf = (c: (typeof CASES)[number]): SrsContext => ({
  idUsuario: c.admin,
  idUsuarioRolrel: null,
  idRol: 2,
  idDealerProvider: c.prov,
  isUserDealer: false,
  isActive: true,
})

const cents = (n: unknown) => Math.round(Number(n) * 100)

/**
 * La consulta de legacy, aparte de la de Nest: el WHERE de `InvoiceDao::getWhere` con lo que arma la solapa (sin el
 * `EXISTS` de «línea facturable»). `services` = el csv de `id_inv_service` (uno o varios).
 */
function legacySql(opts: { includeZero: boolean; completedOnly: boolean; services: number[] }): string {
  const svc = opts.services.join(',')
  const total = opts.services.length ? `GET_TOTAL_BY_INVOICE_IN(i.id,'${svc}')` : 'GET_TOTAL_BY_INVOICE(i.id,0)'
  return `
    SELECT i.id, ${total} AS total
      FROM INVOICE i
     INNER JOIN CONTRATISTA dealer_prov ON dealer_prov.id = i.id_dealer_provider
     INNER JOIN CONTRATISTA comp_prov ON comp_prov.id = dealer_prov.id_empresa
     INNER JOIN usuarios u ON u.id_usuario = i.id_author
     INNER JOIN DEPARTMENT dpto ON dpto.id = i.id_department
     INNER JOIN CONTRATISTA dealer ON dealer.id = dpto.id_dealer
     INNER JOIN WORKFLOW w ON w.id = i.id_workflow
     INNER JOIN CAR c ON c.id = i.id_car
     INNER JOIN datos_parametricos make ON make.id_dato_parametrico = c.id_make
     INNER JOIN datos_parametricos model ON model.id_dato_parametrico = c.id_model
     WHERE 1
       ${
         opts.services.length
           ? `AND EXISTS (SELECT isr.id FROM INVOICE_SERVICE_REL isr WHERE isr.id_service_invoice IN (${svc}) AND isr.id_invoice=i.id AND IS_WO_SERVICE_INVOICED(isr.id_service_invoice,i.id)=0)
              AND EXISTS (SELECT isr.id FROM INVOICE_SERVICE_REL isr WHERE isr.id_service_invoice IN (${svc}) AND isr.id_invoice=i.id)`
           : ''
       }
       ${
         opts.completedOnly
           ? 'AND i.id_workflow=7 AND i.date_last_chg_workflow BETWEEN ? AND ?'
           : // Legacy dice `<=`: una WO de las 00:00 del día siguiente entra. PRO no (regla mysql-date-ranges, R1 de
             // CODE-review.md): la comparación usa el intervalo semiabierto, la única diferencia declarada.
             'AND i.fecha_alta>=? AND i.fecha_alta<DATE_ADD(?, INTERVAL 1 DAY)'
       }
       ${opts.includeZero ? 'AND WO_IS_FULL_INVOICED(i.id)=0' : 'AND WO_IS_FULL_INVOICED_NO_CEROS(i.id)=0'}
       AND i.wo_imported=0
       ${opts.includeZero ? '' : `AND ${total}>0`}
       AND i.estado=1 AND i.id_dealer_provider=? AND dpto.id_dealer=?`
}

describeIf('WO to be Billed — la lectura contra la copia local (solo lee)', () => {
  jest.setTimeout(600_000)
  let moduleRef: TestingModule
  let db: DataSource
  let service: WoToBeBilledService
  let repository: WoToBeBilledRepository

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
    }).compile()
    db = moduleRef.get(DataSource)
    service = moduleRef.get(WoToBeBilledService)
    repository = moduleRef.get(WoToBeBilledRepository)
  })

  afterAll(async () => {
    await moduleRef?.close()
  })

  /** Toda la lista de Nest (todas las páginas) y su total. */
  const nestAll = async (ctx: SrsContext, dto: WoToBeBilledFilterDto) => {
    const ids: number[] = []
    let total = 0
    for (let page = 1; ; page++) {
      const res = await service.list(ctx, { ...dto, page, pageSize: 200 })
      for (const r of res.results) {
        ids.push(r.id)
        total += cents(r.total)
      }
      if (!res.hasMore) break
    }
    const summary = await service.summary(ctx, dto)
    return { ids, total, summary }
  }

  const legacyAll = async (
    c: (typeof CASES)[number],
    range: { dateFrom: string; dateTo: string },
    opts: { includeZero: boolean; completedOnly: boolean; services: number[] },
  ) => {
    const rows: { id: unknown; total: unknown }[] = await db.query(legacySql(opts), [
      range.dateFrom,
      range.dateTo,
      c.prov,
      c.dealer,
    ])
    return { ids: rows.map((r) => Number(r.id)), total: rows.reduce((a, r) => a + cents(r.total), 0) }
  }

  const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b)

  for (const c of CASES) {
    for (const range of RANGES) {
      for (const includeZero of [false, true]) {
        it(`dealer ${c.dealer}, ${range.dateFrom}…${range.dateTo}, includeZero=${includeZero}: mismas WO y mismo total que legacy`, async () => {
          const dto = { idDealer: c.dealer, ...range, includeZero } as WoToBeBilledFilterDto
          const nest = await nestAll(ctxOf(c), dto)
          const legacy = await legacyAll(c, range, { includeZero, completedOnly: false, services: [] })
          expect(sorted(nest.ids)).toEqual(sorted(legacy.ids))
          expect(new Set(nest.ids).size).toBe(nest.ids.length) // sin repetidos al paginar
          expect(nest.summary.count).toBe(legacy.ids.length)
          expect(cents(nest.summary.total)).toBe(legacy.total)
          expect(nest.total).toBe(legacy.total)
        })
      }
    }
  }

  it('Completed como único Status: contra el día en que la WO pasó a Completed, igual que legacy', async () => {
    const c = CASES[1]
    const range = RANGES[0]
    const nest = await nestAll(ctxOf(c), { idDealer: c.dealer, ...range, status: [7] } as WoToBeBilledFilterDto)
    const legacy = await legacyAll(c, range, { includeZero: false, completedOnly: true, services: [] })
    expect(nest.ids.length).toBeGreaterThan(0)
    expect(sorted(nest.ids)).toEqual(sorted(legacy.ids))
    expect(cents(nest.summary.total)).toBe(legacy.total)
  })

  it('con un servicio (sin Invoice Type): las WO de legacy que tienen ese servicio para facturar, mismo total', async () => {
    const c = CASES[1]
    const range = RANGES[0]
    const [top]: { id: unknown; dep: unknown }[] = await db.query(
      `SELECT isr.id_service_invoice AS id, s.id_department AS dep, COUNT(*) n
         FROM INVOICE i JOIN DEPARTMENT d ON d.id = i.id_department
         JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
         JOIN INVOICE_SERVICE s ON s.id = isr.id_service_invoice
        WHERE i.estado = 1 AND i.id_dealer_provider = ? AND d.id_dealer = ? AND i.fecha_alta >= ?
          AND s.id_department = i.id_department
        GROUP BY 1, 2 ORDER BY n DESC LIMIT 1`,
      [c.prov, c.dealer, range.dateFrom],
    )
    const svc = Number(top.id)
    const nest = await nestAll(ctxOf(c), {
      idDealer: c.dealer,
      ...range,
      departments: [Number(top.dep)],
      services: [svc],
    } as WoToBeBilledFilterDto)
    const legacy = await legacyAll(c, range, { includeZero: false, completedOnly: false, services: [svc] })
    // D17: la lista muestra solo las WO de las que sale alguna línea (el servicio sin invoice y con precio > 0).
    const billable: { id: unknown }[] = legacy.ids.length
      ? await db.query(
          `SELECT DISTINCT isr.id_invoice AS id FROM INVOICE_SERVICE_REL isr
             LEFT JOIN INVOICE_STATEMENT_INV_REL isir ON isir.id_invoice = isr.id_invoice
                   AND isir.id_invoice_service = isr.id_service_invoice AND IS_INVOICE_ACTIVE(isir.id_statement) = 1
            WHERE isr.id_invoice IN (${legacy.ids.join(',')}) AND isr.id_service_invoice = ? AND isr.price > 0
              AND isir.id IS NULL`,
          [svc],
        )
      : []
    expect(nest.ids.length).toBeGreaterThan(0)
    expect(sorted(nest.ids)).toEqual(sorted(billable.map((r) => Number(r.id))))
  })

  describe('Lista = facturable (D17): las WO de la lista son exactamente las de pendingLines', () => {
    for (const c of CASES) {
      for (const invoiceType of [2, 3, 4] as const) {
        for (const includeZero of [false, true]) {
        it(`dealer ${c.dealer}, Invoice Type ${invoiceType}, includeZero=${includeZero}`, async () => {
          const ctx = ctxOf(c)
          let services: number[] = []
          if (invoiceType === 4) {
            const rows: { id: unknown }[] = await db.query(
              `SELECT isr.id_service_invoice AS id, COUNT(*) n
                 FROM INVOICE i JOIN DEPARTMENT d ON d.id = i.id_department
                 JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
                WHERE i.estado = 1 AND i.id_dealer_provider = ? AND d.id_dealer = ? AND i.fecha_alta >= ?
                GROUP BY 1 ORDER BY n DESC LIMIT 2`,
              [c.prov, c.dealer, RANGES[0].dateFrom],
            )
            services = rows.map((r) => Number(r.id))
          }
          const dto = { idDealer: c.dealer, ...RANGES[0], invoiceType, services, includeZero } as WoToBeBilledFilterDto
          const nest = await nestAll(ctx, dto)
          const resolved = await service.resolveFilter(ctx, dto, { forGenerate: true })
          const lines = await repository.pendingLines(resolved.filter)
          // Con «Include Zero Value» todos los dealers tienen WO (el 874 tiene pendiente solo lo que vale $0).
          if (includeZero) expect(nest.ids.length).toBeGreaterThan(0)
          expect(sorted(nest.ids)).toEqual(sorted([...new Set(lines.map((l) => l.idInvoice))]))
          // Toda línea es de una WO de la lista, y sin ceros ninguna vale $0.
          if (!includeZero) expect(lines.every((l) => l.price > 0)).toBe(true)
        })
        }
      }
    }

    it('WO 4215054: con «Selected Services» 147946 + 147951 y sin ceros no aparece; sin Invoice Type, sí', async () => {
      const [wo]: { fecha: unknown; dealer: unknown; prov: unknown }[] = await db.query(
        `SELECT DATE_FORMAT(i.fecha_alta, '%Y-%m-%d') AS fecha, d.id_dealer AS dealer, i.id_dealer_provider AS prov
           FROM INVOICE i JOIN DEPARTMENT d ON d.id = i.id_department WHERE i.id = 4215054`,
      )
      const c = { prov: Number(wo.prov), admin: 78, dealer: Number(wo.dealer) } as const
      const range = { dateFrom: String(wo.fecha), dateTo: String(wo.fecha) }
      const withType = await nestAll(ctxOf(c as any), {
        idDealer: c.dealer,
        ...range,
        invoiceType: 4,
        services: [147946, 147951],
      } as WoToBeBilledFilterDto)
      expect(withType.ids).not.toContain(4215054)
      const resolved = await service.resolveFilter(
        ctxOf(c as any),
        { idDealer: c.dealer, ...range, invoiceType: 4, services: [147946, 147951] } as WoToBeBilledFilterDto,
        { forGenerate: true },
      )
      const lines = await repository.pendingLines(resolved.filter)
      expect(lines.map((l) => l.idInvoice)).not.toContain(4215054)
      const without = await nestAll(ctxOf(c as any), { idDealer: c.dealer, ...range } as WoToBeBilledFilterDto)
      expect(without.ids).toContain(4215054)
    })

    it('WO 4421922: con «by Services» sin servicio no aparece; sin Invoice Type, sí', async () => {
      const [wo]: { fecha: unknown; dealer: unknown; prov: unknown }[] = await db.query(
        `SELECT DATE_FORMAT(i.fecha_alta, '%Y-%m-%d') AS fecha, d.id_dealer AS dealer, i.id_dealer_provider AS prov
           FROM INVOICE i JOIN DEPARTMENT d ON d.id = i.id_department WHERE i.id = 4421922`,
      )
      const [admin]: { id: unknown }[] = await db.query(
        `SELECT u.id_usuario AS id FROM usuarios u JOIN USUARIO_ROL_REL ur ON ur.id_usuario = u.id_usuario AND ur.id_rol = 2
          WHERE u.id_contratista_owner = ? AND u.estado = 1 LIMIT 1`,
        [Number(wo.prov)],
      )
      const c = { prov: Number(wo.prov), admin: Number(admin.id), dealer: Number(wo.dealer) }
      const range = { dateFrom: String(wo.fecha), dateTo: String(wo.fecha) }
      const withType = await nestAll(ctxOf(c as any), {
        idDealer: c.dealer,
        ...range,
        invoiceType: 2,
      } as WoToBeBilledFilterDto)
      expect(withType.ids).not.toContain(4421922)
      const without = await nestAll(ctxOf(c as any), { idDealer: c.dealer, ...range } as WoToBeBilledFilterDto)
      expect(without.ids).toContain(4421922)
    })
  })

  // R1 de CODE-review.md: `fecha_alta` es DATETIME. La WO 62543 (3668680) es del 30/07/2025 a las 00:00: no es del 29/07.
  it('el rango es semiabierto: una WO de las 00:00 del día siguiente no entra en la lista, el total ni las líneas', async () => {
    const c = CASES[1] // empresa 232, dealer 594
    const day = { dateFrom: '2025-07-29', dateTo: '2025-07-29' }
    const next = { dateFrom: '2025-07-30', dateTo: '2025-07-30' }
    const dto = (range: typeof day) => ({ idDealer: c.dealer, ...range, includeZero: true, invoiceType: 3 }) as WoToBeBilledFilterDto
    const lines = async (range: typeof day) =>
      (await repository.pendingLines((await service.resolveFilter(ctxOf(c), dto(range), { forGenerate: true })).filter)).map((l) => l.idInvoice)
    expect((await nestAll(ctxOf(c), dto(day))).ids).not.toContain(3668680)
    expect(await lines(day)).not.toContain(3668680)
    expect((await nestAll(ctxOf(c), dto(next))).ids).toContain(3668680)
    expect(await lines(next)).toContain(3668680)
  })
})
