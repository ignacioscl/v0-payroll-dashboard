/**
 * WO to be Billed (plans/plan-wo-to-be-billed-v0, T11): las escrituras de Nest contra la copia local de PROD del 12/11
 * (`srssui5_srs_20261112` en 127.0.0.1:3307). **Escribe y deja todo como estaba:**
 * - lo que se puede deshacer corre dentro de una transacción de afuera que se revierte siempre (`inRollback`, como
 *   `expense-integration.spec.ts`);
 * - lo que necesita transacciones reales (todo o nada, Lock Date con el candado tomado, dos a la vez) borra lo que crea
 *   al terminar cada prueba y otra vez en `afterAll`, y devuelve el Lock Date y el PO# que cambió por otra conexión.
 *
 * Datos (dealer 594 de la empresa 232, alta el 08/11/2026): WO A y B con New Car PDI (dept 980, $65), C con Loaner Wash
 * (dept 981, $7.75) y Z con Delivery en $0. El usuario operativo 3033 (rol 29 de la 232, sin «Lock Date» del dealer) es
 * el que prueba el Lock Date: para un Admin `CHECK_DATE_FREEZE` siempre da 1, y en la copia nadie más que los Admin tiene
 * los dos permisos de Invoices; por eso esas pruebas entran por la transacción (`generateTx` / `generateIndividualTx`)
 * con el filtro ya resuelto, y los permisos de antes quedan en las unitarias.
 *
 * Se salta solo, con aviso, si la base no es esa copia.
 */
import 'dotenv/config'
import { ConflictException, ForbiddenException } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { addTransactionalDataSource, initializeTransactionalContext, runInTransaction } from 'typeorm-transactional'

import configuration from 'src/configuration'
import { dataSourceOptions } from 'src/typeorm.config'
import { SRS_CONNECTION, srsDataSourceOptions } from 'src/srs/srs.datasource'
import { SrsContext } from 'src/srs/auth/srs-auth-context.service'
import { SrsPermissionRepository } from 'src/srs/auth/srs-permission.repository'
import { MSG_BILLING_BLOCKED } from 'src/srs/billing/billing-dealer-scope'
import { WoToBeBilledFilterDto } from 'src/srs/billing/dto/wo-to-be-billed.dto'
import { nextInvoiceNumber } from 'src/srs/billing/invoice-number'
import { MSG_NOTHING_TO_INVOICE, WoToBeBilledService } from 'src/srs/billing/service/wo-to-be-billed.service'
import { SrsBillingModule } from 'src/srs/billing/srs-billing.module'
import { LogChangeService } from 'src/features/srs-log-change/service/log-change.service'
import { WorkOrderRulesRepository } from 'src/features/srs-invoice/repository/work-order-rules.repository'
import { WorkOrderFacadeService } from 'src/features/srs-invoice/service/work-order-facade.service'
import { SrsInvoiceModule } from 'src/features/srs-invoice/srs-invoice.module'
import { MSG_WO_ALREADY_INVOICED, msgLogBatch, msgLogIndividual, WoInvoiceFacadeService } from './service/wo-invoice-facade.service'
import { SrsInvoiceStatementModule } from './srs-invoice-statement.module'

const LOCAL_COPY = 'srssui5_srs_20261112'
const ready = process.env.DB_DATABASE === LOCAL_COPY && process.env.DB_PORT === '3307'
if (!ready) console.warn(`SKIPPED wo-invoice-integration.spec.ts: la base no es la copia local ${LOCAL_COPY} en 127.0.0.1:3307.`)
const describeIf = ready ? describe : describe.skip

const PROV = 232
const ADMIN = 46
const DEALER = 594
const DAY = '2026-11-08'
const A = 4416276 // New Car PDI $65, dept 980
const B = 4416284 // New Car PDI $65, dept 980
const C = 4416429 // Loaner Wash $7.75, dept 981
const Z = 4416275 // Delivery $0, dept 980
const OUR_WOS = [A, B, C, Z]
const SVC_PDI = 13910
const SVC_LOANER = 146692
const SVC_DELIVERY = 137440
const DEP_980 = 980
const OPERATIVE = 3033
const OPERATIVE_REL = 27158
const OPERATIVE_ROL = 29
const FOREIGN_WO = 4423775 // de la empresa 79

const admin: SrsContext = { idUsuario: ADMIN, idUsuarioRolrel: null, idRol: 2, idDealerProvider: PROV, isUserDealer: false, isActive: true }
const operative: SrsContext = { ...admin, idUsuario: OPERATIVE, idUsuarioRolrel: OPERATIVE_REL, idRol: OPERATIVE_ROL }

const dto = (patch: Partial<WoToBeBilledFilterDto> = {}) =>
  ({ idDealer: DEALER, dateFrom: DAY, dateTo: DAY, woIds: [A, B, C], ...patch }) as WoToBeBilledFilterDto

class Rollback extends Error {}

/** Corre la prueba dentro de una transacción y la deshace siempre (el error propio sale al final). */
async function inRollback(fn: () => Promise<void>): Promise<void> {
  let failure: unknown
  try {
    await runInTransaction(async () => {
      try {
        await fn()
      } catch (e) {
        failure = e
      }
      throw new Rollback()
    })
  } catch (e) {
    if (!(e instanceof Rollback)) throw e
  }
  if (failure) throw failure
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describeIf('WO to be Billed — las escrituras contra la copia local', () => {
  jest.setTimeout(120_000)
  let moduleRef: TestingModule
  let db: DataSource
  /** Otra conexión, fuera de todo `runInTransaction`: la «otra persona» que toca la base a la vez. */
  let other: DataSource
  let screen: WoToBeBilledService
  let facade: WoInvoiceFacadeService
  let workOrders: WorkOrderFacadeService
  let rules: WorkOrderRulesRepository
  let logs: LogChangeService
  let permissions: SrsPermissionRepository

  let maxStatementBefore = 0
  let dealerRel: { id: number; dateFreeze: string | null }
  const created = new Set<number>()
  const restoreInvoice: Array<{ id: number; po: string | null; poSemi: number }> = []

  /** Las invoices que tocan nuestras WO y se crearon en esta corrida (por si una prueba se cortó a mitad). */
  const ourStatements = async (): Promise<number[]> => {
    const rows: { id: unknown }[] = await other.query(
      `SELECT DISTINCT r.id_statement AS id FROM INVOICE_STATEMENT_INV_REL r
        WHERE r.id_statement > ? AND r.id_invoice IN (${OUR_WOS.map(() => '?').join(',')})`,
      [maxStatementBefore, ...OUR_WOS],
    )
    return rows.map((r) => Number(r.id))
  }

  const purge = async (ids: number[]) => {
    const all = [...new Set([...ids, ...(await ourStatements())])]
    if (!all.length) return
    const marks = all.map(() => '?').join(',')
    await other.query(`DELETE FROM LOG_CHANGE WHERE id_invoice_statement IN (${marks})`, all)
    await other.query(`DELETE FROM INVOICE_STATEMENT_SEL_SER_REL WHERE id_statement IN (${marks})`, all)
    await other.query(`DELETE FROM INVOICE_STATEMENT_INV_REL WHERE id_statement IN (${marks})`, all)
    await other.query(`DELETE FROM INVOICE_STATEMENT WHERE id IN (${marks}) AND id_dealer = ? AND id_dealer_provider = ?`, [...all, DEALER, PROV])
    for (const id of all) created.delete(id)
  }

  const restoreFreeze = () => other.query('UPDATE DEALER_REL SET date_freeze = ? WHERE id = ?', [dealerRel.dateFreeze, dealerRel.id])

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
        SrsInvoiceModule,
        SrsInvoiceStatementModule,
      ],
    }).compile()
    db = moduleRef.get(DataSource)
    other = await new DataSource({ ...dataSourceOptions, logging: false, poolSize: 2 } as typeof dataSourceOptions).initialize()
    screen = moduleRef.get(WoToBeBilledService)
    facade = moduleRef.get(WoInvoiceFacadeService)
    workOrders = moduleRef.get(WorkOrderFacadeService)
    rules = moduleRef.get(WorkOrderRulesRepository)
    logs = moduleRef.get(LogChangeService)
    permissions = moduleRef.get(SrsPermissionRepository)

    const [max]: { m: unknown }[] = await other.query('SELECT COALESCE(MAX(id), 0) AS m FROM INVOICE_STATEMENT')
    maxStatementBefore = Number(max.m)
    const [rel]: { id: unknown; f: string | null }[] = await other.query(
      `SELECT id, DATE_FORMAT(date_freeze, '%Y-%m-%d') AS f FROM DEALER_REL
        WHERE id_dealer_customer = ? AND id_dealer_provider = ? AND fecha_end IS NULL LIMIT 1`,
      [DEALER, PROV],
    )
    dealerRel = { id: Number(rel.id), dateFreeze: rel.f }
    // Las WO de la prueba tienen que estar pendientes y activas; si otra sesión las facturó, se avisa claro.
    const state: { id: unknown; estado: unknown; inv: unknown }[] = await other.query(
      `SELECT id, estado, WO_HAVE_INVOICE(id) AS inv FROM INVOICE WHERE id IN (${OUR_WOS.map(() => '?').join(',')})`,
      OUR_WOS,
    )
    expect(state.map((s) => [Number(s.id), Number(s.estado), Number(s.inv)]).sort()).toEqual(OUR_WOS.map((id) => [id, 1, 0]).sort())
    // El Lock Date del dealer hoy no cubre el día de las WO, y el operativo no tiene el permiso de saltearlo.
    expect(dealerRel.dateFreeze == null || dealerRel.dateFreeze < DAY).toBe(true)
    const [f]: { r: unknown }[] = await other.query('SELECT CHECK_DATE_FREEZE(?, ?, ?, ?) AS r', [OPERATIVE, DEALER, PROV, DAY])
    expect(Number(f.r)).toBe(1)
  }, 120_000)

  afterAll(async () => {
    const errors: unknown[] = []
    const step = async (fn: () => Promise<unknown>) => {
      try {
        await fn()
      } catch (e) {
        errors.push(e)
      }
    }
    if (other?.isInitialized) {
      await step(() => purge([...created]))
      if (dealerRel) await step(restoreFreeze)
      for (const r of restoreInvoice) {
        await step(() => other.query('UPDATE INVOICE SET po = ?, po_semi_req = ? WHERE id = ?', [r.po, r.poSemi, r.id]))
      }
      await step(() => other.destroy())
    }
    await moduleRef?.close()
    if (errors.length) throw errors[0]
  }, 120_000)

  // ------------------------------------------------------------------ lecturas de apoyo

  const statementRow = async (id: number) => {
    const [row]: Record<string, unknown>[] = await db.query(
      `SELECT id_dealer, id_dealer_provider, id_department, id_invoice_service, id_author, id_invoice_statement_schedule,
              invoice_service_sel_rel, invoice_prefix, invoice_nro, full_nro, po, ro, invoice_note, header_note, tax,
              discount, discount_detail, statement_type, sended, last_sended, estado,
              DATE_FORMAT(fecha_desde, '%Y-%m-%d') AS fecha_desde, DATE_FORMAT(fecha_hasta, '%Y-%m-%d') AS fecha_hasta
         FROM INVOICE_STATEMENT WHERE id = ?`,
      [id],
    )
    return row
  }
  const linesOf = async (id: number) =>
    (
      (await db.query(
        `SELECT id_invoice, id_invoice_service, id_employee_work, amount, description, generic_qty, only_timecard
           FROM INVOICE_STATEMENT_INV_REL WHERE id_statement = ? ORDER BY id_invoice, id_invoice_service`,
        [id],
      )) as Record<string, unknown>[]
    ).map((r) => ({ ...r, id_invoice: Number(r.id_invoice), id_invoice_service: Number(r.id_invoice_service) }))
  const logOf = async (id: number) =>
    (await db.query('SELECT id_autor, desc_cambio, desc_json, origen FROM LOG_CHANGE WHERE id_invoice_statement = ?', [id])) as unknown[]
  const selOf = async (id: number) =>
    ((await db.query('SELECT id_inv_service AS s FROM INVOICE_STATEMENT_SEL_SER_REL WHERE id_statement = ? ORDER BY id', [id])) as { s: unknown }[]).map(
      (r) => Number(r.s),
    )
  const nextNumber = async () => (await nextInvoiceNumber(other, DEALER, PROV)).fullNro
  const invoiceRow = async (id: number, conn: { query: DataSource['query'] } = db) =>
    ((await conn.query('SELECT * FROM INVOICE WHERE id = ?', [id])) as Record<string, unknown>[])[0]
  const auxRow = async (id: number) => ((await db.query('SELECT * FROM INVOICE_AUX WHERE ID = ?', [id])) as Record<string, unknown>[])[0] ?? null
  const changedKeys = (before: Record<string, unknown>, after: Record<string, unknown>) =>
    Object.keys(before).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
  const line = (idInvoice: number, idService: number) => ({
    id_invoice: idInvoice,
    id_invoice_service: idService,
    id_employee_work: null,
    amount: null,
    description: null,
    generic_qty: null,
    only_timecard: 0,
  })
  /** Lo que la tabla de T3 deja en nulo o con el default del DDL en toda invoice. */
  const fixedColumns = {
    id_dealer: DEALER,
    id_dealer_provider: PROV,
    id_invoice_statement_schedule: null,
    ro: null,
    invoice_note: null,
    header_note: null,
    tax: null,
    discount: null,
    discount_detail: null,
    sended: 0,
    last_sended: null,
    estado: 1,
  }

  // ------------------------------------------------------------------ 1. cada tipo, columna por columna (T3)

  it('2 «by Services» sin servicio: una invoice por servicio, en el orden del catálogo, cada una con sus WO', () =>
    inRollback(async () => {
      const first = await nextNumber()
      const res = await facade.generate(admin, dto({ invoiceType: 2 }))
      expect(res.workOrders).toBe(3)
      expect(res.invoices).toHaveLength(2)
      const order: { id: unknown }[] = await db.query(
        'SELECT id FROM INVOICE_SERVICE WHERE id IN (?, ?) ORDER BY use_qty DESC, nombre',
        [SVC_PDI, SVC_LOANER],
      )
      const expected = order.map((o) => Number(o.id))
      const rows = await Promise.all(res.invoices.map((i) => statementRow(i.id)))
      expect(rows.map((r) => Number(r.id_invoice_service))).toEqual(expected)
      expect(rows[0].full_nro).toBe(first)
      expect(Number(rows[1].invoice_nro)).toBe(Number(rows[0].invoice_nro) + 1)
      const byService = new Map(rows.map((r, i) => [Number(r.id_invoice_service), { row: r, id: res.invoices[i].id }]))
      expect(byService.get(SVC_PDI)!.row).toMatchObject({
        ...fixedColumns,
        id_department: DEP_980,
        id_author: ADMIN,
        statement_type: 2,
        fecha_desde: DAY,
        fecha_hasta: DAY,
        invoice_service_sel_rel: null,
        po: null,
      })
      expect(Number(byService.get(SVC_LOANER)!.row.id_department)).toBe(981)
      expect(await linesOf(byService.get(SVC_PDI)!.id)).toEqual([line(A, SVC_PDI), line(B, SVC_PDI)])
      expect(await linesOf(byService.get(SVC_LOANER)!.id)).toEqual([line(C, SVC_LOANER)])
      expect(await logOf(byService.get(SVC_PDI)!.id)).toEqual([{ id_autor: ADMIN, desc_cambio: msgLogBatch(2), desc_json: null, origen: 'pro' }])
      // Las WO facturadas salen de la lista (la lista muestra todo el día: las tildadas solo cuentan al generar).
      const list = await screen.list(admin, { ...dto(), page: 1, pageSize: 200 })
      expect(list.hasMore).toBe(false)
      expect(list.results.length).toBeGreaterThan(0)
      expect(list.results.map((r) => r.id).filter((id) => [A, B, C].includes(id))).toEqual([])
    }))

  it('2 «by Services» con servicio: una, con el department y el servicio elegidos', () =>
    inRollback(async () => {
      const res = await facade.generate(admin, dto({ invoiceType: 2, departments: [DEP_980], services: [SVC_PDI] }))
      expect(res.invoices).toHaveLength(1)
      expect(await statementRow(res.invoices[0].id)).toMatchObject({ ...fixedColumns, statement_type: 2, id_department: DEP_980, id_invoice_service: SVC_PDI })
      expect(await linesOf(res.invoices[0].id)).toEqual([line(A, SVC_PDI), line(B, SVC_PDI)])
    }))

  it('3 «Multi-Services» sin servicio: una con todo, department nulo; con department, el elegido', () =>
    inRollback(async () => {
      const res = await facade.generate(admin, dto({ invoiceType: 3 }))
      expect(res).toMatchObject({ workOrders: 3 })
      expect(await statementRow(res.invoices[0].id)).toMatchObject({
        ...fixedColumns,
        statement_type: 3,
        id_department: null,
        id_invoice_service: null,
        id_author: ADMIN,
        invoice_service_sel_rel: null,
        po: null,
      })
      expect(await linesOf(res.invoices[0].id)).toEqual([line(A, SVC_PDI), line(B, SVC_PDI), line(C, SVC_LOANER)])
    }))

  it('3 «Multi-Services» con department y servicio: una, con el servicio', () =>
    inRollback(async () => {
      const res = await facade.generate(admin, dto({ invoiceType: 3, departments: [DEP_980], services: [SVC_PDI] }))
      expect(await statementRow(res.invoices[0].id)).toMatchObject({ statement_type: 3, id_department: DEP_980, id_invoice_service: SVC_PDI })
      expect(await linesOf(res.invoices[0].id)).toEqual([line(A, SVC_PDI), line(B, SVC_PDI)])
    }))

  it('4 «Selected Services»: los nombres en el orden pedido y una fila por servicio elegido, aunque no tenga líneas', () =>
    inRollback(async () => {
      const res = await facade.generate(admin, dto({ invoiceType: 4, services: [SVC_LOANER, SVC_PDI, SVC_DELIVERY] }))
      const id = res.invoices[0].id
      const names: { nombre: string }[] = await db.query('SELECT nombre FROM INVOICE_SERVICE WHERE id = ?', [SVC_DELIVERY])
      expect(await statementRow(id)).toMatchObject({
        ...fixedColumns,
        statement_type: 4,
        id_department: null,
        id_invoice_service: null,
        invoice_service_sel_rel: `Loaner Wash, New Car PDI, ${names[0].nombre}`,
      })
      expect(await selOf(id)).toEqual([SVC_LOANER, SVC_PDI, SVC_DELIVERY])
      // Delivery está en $0: sin «Include Zero Value» no tiene líneas, pero su fila de servicio elegido está.
      expect(await linesOf(id)).toEqual([line(A, SVC_PDI), line(B, SVC_PDI), line(C, SVC_LOANER)])
    }))

  it('«Include Zero Value»: entra la WO en $0; sin él, sola, no hay nada que facturar', () =>
    inRollback(async () => {
      await expect(facade.generate(admin, dto({ invoiceType: 3, woIds: [Z] }))).rejects.toThrow(MSG_NOTHING_TO_INVOICE)
      const res = await facade.generate(admin, dto({ invoiceType: 3, woIds: [A, Z], includeZero: true }))
      expect(await linesOf(res.invoices[0].id)).toEqual([line(Z, SVC_DELIVERY), line(A, SVC_PDI)])
    }))

  it('individual: tipo 1, a nombre del autor de la WO (D14), fechas y PO de la WO, log de quien hizo clic', () =>
    inRollback(async () => {
      const wo = await invoiceRow(A)
      const res = await facade.generateIndividual(admin, A, {})
      expect(res).toMatchObject({ dateFrom: DAY, dateTo: DAY })
      expect(await statementRow(res.id)).toMatchObject({
        ...fixedColumns,
        statement_type: 1,
        id_author: Number(wo.id_author),
        id_department: DEP_980,
        id_invoice_service: null,
        invoice_service_sel_rel: null,
        po: wo.po ?? null,
        fecha_desde: DAY,
        fecha_hasta: DAY,
      })
      expect(await linesOf(res.id)).toEqual([line(A, SVC_PDI)])
      expect(await logOf(res.id)).toEqual([{ id_autor: ADMIN, desc_cambio: msgLogIndividual(String(wo.full_nro)), desc_json: null, origen: 'pro' }])
      await expect(facade.generateIndividual(admin, A, {})).rejects.toThrow(MSG_WO_ALREADY_INVOICED)
    }))

  // ------------------------------------------------------------------ 2. todo o nada

  it('todo o nada: un fallo después de la segunda invoice no deja ninguna invoice, línea ni número usado', async () => {
    const before = await nextNumber()
    const original = logs.logInvoiceStatement.bind(logs)
    let calls = 0
    const spy = jest.spyOn(logs, 'logInvoiceStatement').mockImplementation(async (...args) => {
      calls++
      if (calls === 2) throw new Error('fallo forzado después de la segunda invoice')
      return original(...args)
    })
    try {
      await expect(facade.generate(admin, dto({ invoiceType: 2 }))).rejects.toThrow('fallo forzado')
      expect(calls).toBe(2)
    } finally {
      spy.mockRestore()
    }
    expect(await ourStatements()).toEqual([])
    const [stmts]: { c: unknown }[] = await other.query('SELECT COUNT(*) AS c FROM INVOICE_STATEMENT WHERE id > ? AND id_dealer = ?', [maxStatementBefore, DEALER])
    expect(Number(stmts.c)).toBe(0)
    expect(await nextNumber()).toBe(before)
  })

  // ------------------------------------------------------------------ 2 bis. Lock Date con el candado tomado

  /** Toma el candado del dealer en otra conexión, arranca `run`, comprueba que espera, pone el Lock Date y suelta. */
  const withLockThenFreeze = async (run: () => Promise<unknown>) => {
    const qr = other.createQueryRunner()
    await qr.connect()
    try {
      await qr.startTransaction()
      await qr.query('SELECT id FROM DEALER_REL WHERE id_dealer_customer = ? AND id_dealer_provider = ? AND estado = 1 FOR UPDATE', [DEALER, PROV])
      let settled = false
      const outcome = run().then(
        (ok) => ({ ok, err: null as unknown }),
        (err: unknown) => ({ ok: null, err }),
      )
      void outcome.then(() => (settled = true))
      await sleep(1500)
      expect(settled).toBe(false) // está esperando el candado
      await qr.query('UPDATE DEALER_REL SET date_freeze = ? WHERE id = ?', [DAY, dealerRel.id])
      await qr.commitTransaction()
      return await outcome
    } finally {
      if (qr.isTransactionActive) await qr.rollbackTransaction()
      await qr.release()
      await restoreFreeze()
    }
  }

  it('Lock Date con el candado tomado (por tanda): al seguir responde «The billing has been blocked» y no crea nada', async () => {
    const resolved = await screen.resolveFilter(admin, dto({ invoiceType: 3 }), { forGenerate: true })
    const out = await withLockThenFreeze(() => facade.generateTx(operative, resolved))
    expect(out.ok).toBeNull()
    expect((out.err as Error).message).toBe(MSG_BILLING_BLOCKED)
    expect(await ourStatements()).toEqual([])
  })

  it('Lock Date con el candado tomado (individual): lo mismo contra la fecha de alta de la WO', async () => {
    const out = await withLockThenFreeze(() => facade.generateIndividualTx(operative, A, DEALER, false))
    expect((out.err as Error).message).toBe(MSG_BILLING_BLOCKED)
    expect(await ourStatements()).toEqual([])
  })

  // ------------------------------------------------------------------ 2 ter. sesión externa (D7)

  it('sesión externa con los dos permisos y el dealer en alcance: 403 en las ocho rutas y no escribe; con su rol propio entra', async () => {
    const [foreignRel]: { id: unknown }[] = await other.query('SELECT id FROM USUARIO_ROL_REL WHERE id_usuario <> ? ORDER BY id LIMIT 1', [OPERATIVE])
    // (d) de la tabla de casos: un rol firmado que no es del usuario.
    const external: SrsContext = { ...operative, idUsuarioRolrel: Number(foreignRel.id) }
    const perms = [
      jest.spyOn(permissions, 'assertRolAccion').mockResolvedValue(undefined),
      jest.spyOn(permissions, 'userHasRolAccion').mockResolvedValue(true),
    ]
    try {
      const before = await invoiceRow(A, other)
      const calls: Array<[string, () => Promise<unknown>]> = [
        ['lista', () => screen.list(external, { ...dto(), page: 1, pageSize: 50 })],
        ['total', () => screen.summary(external, dto())],
        ['config', () => screen.config(external, DEALER)],
        ['cuenta previa', () => screen.preview(external, dto({ invoiceType: 3 }))],
        ['generar', () => facade.generate(external, dto({ invoiceType: 3 }))],
        ['individual', () => facade.generateIndividual(external, A, {})],
        ['eliminar', () => workOrders.delete(external, { ids: [A], bulk: true })],
        ['RO# / PO#', () => workOrders.updateRoPo(external, A, { field: 'ro', value: 'EXT' })],
      ]
      for (const [name, call] of calls) {
        const err = await call().then(
          () => null,
          (e: unknown) => e,
        )
        expect([name, err instanceof ForbiddenException]).toEqual([name, true])
      }
      expect(await invoiceRow(A, other)).toEqual(before)
      expect(await ourStatements()).toEqual([])
      // El mismo usuario con su rol propio (interno) pasa el control de la pantalla.
      await expect(screen.assertScreenAccess(operative)).resolves.toBeUndefined()
    } finally {
      for (const p of perms) p.mockRestore()
    }
  })

  // ------------------------------------------------------------------ 3. dos a la vez

  it('dos generaciones a la vez del mismo dealer y las mismas WO: una crea, la otra espera y no encuentra nada', async () => {
    const results = await Promise.allSettled([facade.generate(admin, dto({ invoiceType: 3, woIds: [A, B] })), facade.generate(admin, dto({ invoiceType: 3, woIds: [A, B] }))])
    try {
      const ok = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<WoInvoiceFacadeService['generate']>>> => r.status === 'fulfilled')
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      for (const r of ok) for (const i of r.value.invoices) created.add(i.id)
      expect(ok).toHaveLength(1)
      expect(failed).toHaveLength(1)
      expect((failed[0].reason as Error).message).toBe(MSG_NOTHING_TO_INVOICE)
      const twice: unknown[] = await other.query(
        `SELECT r.id_invoice FROM INVOICE_STATEMENT_INV_REL r
          WHERE r.id_invoice IN (?, ?) AND IS_INVOICE_ACTIVE(r.id_statement) = 1
          GROUP BY r.id_invoice, r.id_invoice_service HAVING COUNT(DISTINCT r.id_statement) > 1`,
        [A, B],
      )
      expect(twice).toEqual([])
    } finally {
      await purge([...created])
    }
  })

  it('dos individuales a la vez de la misma WO: una crea, la otra 409 «Work order already invoiced»', async () => {
    const results = await Promise.allSettled([facade.generateIndividual(admin, A, {}), facade.generateIndividual(admin, A, {})])
    try {
      const ok = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<WoInvoiceFacadeService['generateIndividual']>>> => r.status === 'fulfilled')
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      for (const r of ok) created.add(r.value.id)
      expect(ok).toHaveLength(1)
      expect(failed[0].reason).toBeInstanceOf(ConflictException)
      expect((failed[0].reason as Error).message).toBe(MSG_WO_ALREADY_INVOICED)
      expect(await ourStatements()).toHaveLength(1)
    } finally {
      await purge([...created])
    }
  })

  // ------------------------------------------------------------------ 4. eliminar y RO# / PO#

  it('eliminar: cambia solo `estado` (ni stock_number, ni fecha_alta, ni INVOICE_AUX) y deja la línea de legacy en el Log', () =>
    inRollback(async () => {
      const before = await invoiceRow(A)
      const auxBefore = await auxRow(A)
      const res = await workOrders.delete(admin, { ids: [A], bulk: true })
      expect(res).toEqual({ deleted: [{ id: A, fullNro: String(before.full_nro) }], failed: [] })
      const after = await invoiceRow(A)
      expect(changedKeys(before, after)).toEqual(['estado'])
      expect(Number(after.estado)).toBe(0)
      expect(await auxRow(A)).toEqual(auxBefore)
      const log: { desc_cambio: string; origen: string; id_autor: unknown }[] = await db.query(
        'SELECT desc_cambio, origen, id_autor FROM LOG_CHANGE WHERE id_invoice = ? ORDER BY id DESC LIMIT 1',
        [A],
      )
      expect(log[0]).toEqual({ desc_cambio: `Invoice #${before.full_nro} deleted`, origen: 'pro', id_autor: ADMIN })
    }))

  it('eliminar una WO de otra empresa: no se elimina y la respuesta trae solo el id', () =>
    inRollback(async () => {
      const before = await invoiceRow(FOREIGN_WO)
      const res = await workOrders.delete(admin, { ids: [FOREIGN_WO], bulk: true })
      expect(res).toEqual({ deleted: [], failed: [{ id: FOREIGN_WO, reason: 'Forbidden' }] })
      expect(await invoiceRow(FOREIGN_WO)).toEqual(before)
    }))

  it('RO#: cambia el RO# y, como mucho, las tres marcas; nada más', () =>
    inRollback(async () => {
      const before = await invoiceRow(A)
      await expect(workOrders.updateRoPo(admin, A, { field: 'ro', value: 'it-ro1' })).resolves.toMatchObject({ ro: 'IT-RO1' })
      const after = await invoiceRow(A)
      const changed = changedKeys(before, after)
      expect(changed).toContain('ro')
      for (const k of changed) expect(['ro', 'ro_semi_req', 'po_semi_req', 'stock_semi_req']).toContain(k)
      const log: { desc_cambio: string }[] = await db.query('SELECT desc_cambio FROM LOG_CHANGE WHERE id_invoice = ? ORDER BY id DESC LIMIT 1', [A])
      expect(log[0].desc_cambio).toBe(`RO# edited from ${before.ro ?? ''} to:IT-RO1`)
      // Guardar lo mismo otra vez no escribe ni suma Log.
      const [count]: { c: unknown }[] = await db.query('SELECT COUNT(*) AS c FROM LOG_CHANGE WHERE id_invoice = ?', [A])
      await workOrders.updateRoPo(admin, A, { field: 'ro', value: 'IT-RO1' })
      const [again]: { c: unknown }[] = await db.query('SELECT COUNT(*) AS c FROM LOG_CHANGE WHERE id_invoice = ?', [A])
      expect(Number(again.c)).toBe(Number(count.c))
    }))

  it('RO# obligatorio por cada una de las tres fuentes (dealer, servicio de la WO, rol del usuario): vacío corta con el error en el campo', async () => {
    const emptyRo = () =>
      workOrders.updateRoPo(admin, A, { field: 'ro', value: '' }).then(
        () => null,
        (e: { validationErrors?: Array<{ field: string; message: string }> }) => e.validationErrors?.[0] ?? e,
      )
    const required = { field: 'value', message: 'RO# is required for this work order' }
    // Hoy ninguna fuente lo pide: vacío pasa (sin cambio).
    await inRollback(async () => expect(await emptyRo()).toBeNull())
    // 1. El dealer (`DEALER_REL.has_ro_required`).
    await inRollback(async () => {
      await db.query('UPDATE DEALER_REL SET has_ro_required = 1 WHERE id = ?', [dealerRel.id])
      expect(await emptyRo()).toMatchObject(required)
    })
    // 2. Un servicio de la WO (`INVOICE_SERVICE.has_ro_required`).
    await inRollback(async () => {
      await db.query('UPDATE INVOICE_SERVICE SET has_ro_required = 1 WHERE id = ?', [SVC_PDI])
      expect(await emptyRo()).toMatchObject(required)
    })
    // 3. El usuario: un servicio suyo del department de la WO con exactamente una regla de su rol que lo pide.
    await inRollback(async () => {
      const [rol]: { id_rol: unknown }[] = await db.query('SELECT id_rol FROM USUARIO_ROL_REL WHERE id_usuario = ? ORDER BY id LIMIT 1', [ADMIN])
      await db.query('INSERT INTO USUARIO_SERVICE_REL (id_usuario, id_service) VALUES (?, ?)', [ADMIN, SVC_PDI])
      await db.query('INSERT INTO ROL_SERVICE_FIELD_REL (id_rol, id_service, has_ro_required) VALUES (?, ?, 1)', [Number(rol.id_rol), SVC_PDI])
      expect(await emptyRo()).toMatchObject(required)
    })
  })

  it('RO#: la fila queda tomada; otra conexión que vacía el PO# en el medio espera, y la respuesta y el log traen lo que la fila tiene (R15)', async () => {
    const original = await invoiceRow(B, other)
    restoreInvoice.push({ id: B, po: (original.po as string | null) ?? null, poSemi: Number(original.po_semi_req) })
    await other.query("UPDATE INVOICE SET po = 'ITPO', po_semi_req = 0 WHERE id = ?", [B])
    const realRules = rules.roPoRules.bind(rules)
    let otherDone = false
    let otherUpdate: Promise<unknown> = Promise.resolve()
    const spy = jest.spyOn(rules, 'roPoRules').mockImplementation(async (...args) => {
      const r = await realRules(...args)
      // Entre la lectura de la WO y el UPDATE, otra persona quiere vaciar el PO#: tiene que esperar el candado.
      otherUpdate = other.query("UPDATE INVOICE SET po = '' WHERE id = ?", [B]).then(() => (otherDone = true))
      await sleep(800)
      return { ...r, roRequired: false, poSemi: true }
    })
    try {
      await inRollback(async () => {
        const res = await workOrders.updateRoPo(admin, B, { field: 'ro', value: 'it-ro2' })
        expect(otherDone).toBe(false) // la otra conexión espera el candado de la fila
        expect(res).toEqual({ ro: 'IT-RO2', po: 'ITPO' })
        const after = await invoiceRow(B)
        expect(after.po).toBe('ITPO')
        expect(Number(after.po_semi_req)).toBe(0) // con PO# cargado, la marca no se prende
        const [log]: { desc_cambio: string }[] = await db.query('SELECT desc_cambio FROM LOG_CHANGE WHERE id_invoice = ? ORDER BY id DESC LIMIT 1', [B])
        expect(log.desc_cambio).toBe(`RO# edited from ${original.ro ?? ''} to:IT-RO2`)
      })
      // Al soltar el candado (la transacción de afuera se deshace), la otra conexión sigue.
      await otherUpdate
      expect(otherDone).toBe(true)
      expect((await invoiceRow(B, other)).po).toBe('')
    } finally {
      spy.mockRestore()
      await otherUpdate.catch(() => undefined)
      await other.query('UPDATE INVOICE SET po = ?, po_semi_req = ? WHERE id = ?', [original.po ?? null, Number(original.po_semi_req), B])
    }
    const restored = await invoiceRow(B, other)
    expect(changedKeys(original, restored)).toEqual([])
  })
})
