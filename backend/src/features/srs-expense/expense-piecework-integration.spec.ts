/**
 * Expense Piecework (plans/plan-reunion-juan-18-11, temas 3 y 4, D4–D8), camino entero contra la copia local de PROD
 * del 12/11 (`srssui5_srs_20261112` en 127.0.0.1:3307) con la migration 032: la tabla de WO del modal, el alta, el
 * Monthly Closing de ese mes, la edición, el borrado y el Restore. Vendor: Francol Services LLC (6985, Auto Wax).
 *
 * A diferencia de expense-integration.spec.ts, ESCRIBE de verdad (el Monthly Closing lee por otra conexión y no vería
 * una transacción abierta). Todo lo que crea lo borra en el afterAll, también si falla algo: las filas de
 * EXP_EXPENSE_PIECEWORK_WO, EXP_EXPENSE, EXP_EXPENSE_GROUP y LOG_GENERIC de esas expenses, y la compañía y la
 * categoría creadas al vuelo si no existían antes. No toca nada que no haya creado.
 *
 * Se salta solo, con aviso, si la base no es esa copia o si la migration 032 no se corrió.
 */
import 'dotenv/config'
import { execSync } from 'child_process'
import { ConflictException, ForbiddenException } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { addTransactionalDataSource, initializeTransactionalContext } from 'typeorm-transactional'

import configuration from 'src/configuration'
import { dataSourceOptions } from 'src/typeorm.config'
import { SRS_CONNECTION, srsDataSourceOptions } from 'src/srs/srs.datasource'
import { DataError } from 'src/commons/errors/data.error'
import { SrsContext } from 'src/srs/auth/srs-auth-context.service'
import {
  ROL_ACCION_EXPENSES_ADD,
  ROL_ACCION_EXPENSES_PIECEWORK,
  SrsPermissionRepository,
} from 'src/srs/auth/srs-permission.repository'
import { ExpenseReportRepository } from 'src/srs/expenses/repository/expense-report.repository'
import type { ExpenseDetail, ExpenseGroupRow, ExpenseSingleRow } from 'src/srs/expenses/dto/expense-row.dto'
import { SrsMonthlyClosingModule } from 'src/srs/monthly-closing/monthly-closing.module'
import { MonthlyClosingService } from 'src/srs/monthly-closing/service/monthly-closing.service'
import type { MonthlyClosingDto } from 'src/srs/monthly-closing/dto/monthly-closing.dto'
import { TINT_SERVICE_FRAGMENT } from 'src/srs/monthly-closing/monthly-closing-math'
import {
  EXPENSES_CATEGORY_CATEGORY,
  EXPENSES_COMPANY_CATEGORY,
} from 'src/features/srs-generic-data/entity/generic-data.entity'
import {
  MSG_CHOOSE_VENDOR,
  MSG_PIECEWORK_LOCKED,
  MSG_PIECEWORK_RESTORE_TAKEN,
  MSG_WORK_ORDER_NOT_AVAILABLE,
  PIECEWORK_EXPENSE_CATEGORY,
} from './rules/expense-piecework'
import { toCents } from './rules/expense-rules'
import { ExpenseFacadeService } from './service/expense-facade.service'
import { ExpensePieceworkService, PieceworkWorkOrderDto } from './service/expense-piecework.service'
import { SrsExpenseModule } from './srs-expense.module'

const LOCAL_COPY = 'srssui5_srs_20261112'

/** Sin escribir en la base: solo SHOW TABLES, por el cliente de Homebrew o el contenedor local. */
function migration032Applied(): boolean {
  if (process.env.DB_DATABASE !== LOCAL_COPY || process.env.DB_PORT !== '3307') return false
  const sql = `SHOW TABLES LIKE 'EXP_EXPENSE_PIECEWORK_WO'`
  const env = { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD ?? '' }
  const attempts = [
    `/opt/homebrew/opt/mysql@8.0/bin/mysql -h 127.0.0.1 -P 3307 -u${process.env.DB_USERNAME} ${LOCAL_COPY} -N -e "${sql}"`,
    `docker exec -e MYSQL_PWD srs-mariadb mysql -u${process.env.DB_USERNAME} ${LOCAL_COPY} -N -e "${sql}"`,
  ]
  for (const cmd of attempts) {
    try {
      const out = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000, env }).toString()
      return out.includes('EXP_EXPENSE_PIECEWORK_WO')
    } catch {
      // probar el siguiente cliente
    }
  }
  return false
}

const ready = migration032Applied()
if (!ready) {
  console.warn(
    `SKIPPED expense-piecework-integration.spec.ts: la base no es la copia local ${LOCAL_COPY} en 127.0.0.1:3307 o la ` +
      `migration 032 (EXP_EXPENSE_PIECEWORK_WO) todavía no se corrió.`,
  )
}
const describeIf = ready ? describe : describe.skip

const PROVIDER = 79 // Auto Wax
const ADMIN_USER = 76 // Javier Maldonado, Admin Company de Auto Wax
/** Heriberto Jose Caridad Pina (Regional Operations Manager): tiene 110 (Add Expense) y no 147. */
const USER_WITHOUT_147 = 167
const FRANCOL = 6985 // Francol Services LLC: vendor de Auto Wax, WO con piecework de septiembre a noviembre
const MONTH = '2026-10'
const TICKET_DATE = '2026-10-20'
/** Marca de las expenses de este spec (la limpieza de respaldo borra solo las que la tienen). */
const SPEC_NOTES = 'expense-piecework-integration.spec'

const admin: SrsContext = { idUsuario: ADMIN_USER, idUsuarioRolrel: null, idRol: 2, idDealerProvider: PROVIDER, isUserDealer: false, isActive: true }
const withoutPermission: SrsContext = { ...admin, idUsuario: USER_WITHOUT_147, idRol: 1169 }

const sumCents = (xs: (number | string)[]) => xs.reduce<number>((a, x) => a + toCents(x), 0)

async function catchError(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn()
  } catch (e) {
    return e
  }
  throw new Error('expected the call to throw')
}

function fieldError(e: unknown): { field: string; message: string } {
  expect(e).toBeInstanceOf(DataError)
  const first = (e as DataError).validationErrors?.[0]
  return { field: first?.field ?? '', message: first?.message ?? '' }
}

/** Filas de una expense (suelta o grupo) por dealer. */
function rowsOf(detail: ExpenseDetail): ExpenseSingleRow[] {
  return detail.kind === 'group' ? (detail as ExpenseGroupRow).rows : [detail as ExpenseSingleRow]
}

/**
 * Consulta independiente del piecework de Francol por WO y servicio, con la función del snapshot
 * (`GET_PIECEWORK_EMPLOYEES_BY_WO(..., force_flat_rate = 1)`): la WO es de Francol si está en INVOICE_EMPLOYEE_REL.
 */
const SERVICE_PIECEWORK_SQL = `
  SELECT i.id AS idInvoice, _is.id AS idService, dp.id_dealer AS idDealer, DATE_FORMAT(i.fecha_alta, '%Y-%m-%d') AS workDate,
         IFNULL(GET_PIECEWORK_EMPLOYEES_BY_WO(i.id, _is.id, iser.piecework, 0, i.date_last_chg_workflow, i.fecha_alta, ?, 1), 0) AS piecework
  FROM INVOICE i
  JOIN DEPARTMENT dp ON dp.id = i.id_department
  JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
  JOIN INVOICE_SERVICE _is ON _is.id = isr.id_service_invoice
  LEFT JOIN INVOICE_SERVICE_EMPLOYEE_REL iser
         ON iser.id_invoice = i.id AND iser.id_invoice_service = _is.id AND iser.id_employee = ?
  WHERE i.estado = 1 AND i.id_dealer_provider = ?
    AND EXISTS (SELECT 1 FROM INVOICE_EMPLOYEE_REL ier WHERE ier.id_invoice = i.id AND ier.id_usuario = ?)
    AND i.fecha_alta >= ? AND i.fecha_alta < DATE_ADD(?, INTERVAL 1 DAY)`

interface ServiceRow {
  idInvoice: number
  idService: number
  idDealer: number
  workDate: string
  cents: number
}

describeIf('Expense Piecework — camino entero contra la copia local (escribe y limpia)', () => {
  let moduleRef: TestingModule
  let db: DataSource
  let srs: DataSource
  let facade: ExpenseFacadeService
  let piecework: ExpensePieceworkService
  let closing: MonthlyClosingService
  let report: ExpenseReportRepository
  let permissions: SrsPermissionRepository
  let allDealers: string

  // Lo que había antes, para limpiar solo lo creado.
  let maxPieceworkRowId = 0
  let catalogBefore: { id: number; estado: number }[] = []
  const createdExpenseIds = new Set<number>()
  const createdGroupIds = new Set<number>()

  // Estado del camino (cada test usa lo del anterior).
  let periods: { desde: string; hasta: string }[] = []
  let october: PieceworkWorkOrderDto[] = []
  let chosen: PieceworkWorkOrderDto[] = []
  let serviceRows: ServiceRow[] = []
  let first: ExpenseDetail
  let before: MonthlyClosingDto

  const closingQuery = () => ({ month: MONTH, idDealer: allDealers })

  const track = (detail: ExpenseDetail) => {
    for (const r of rowsOf(detail)) createdExpenseIds.add(r.id)
    if (detail.kind === 'group') createdGroupIds.add((detail as ExpenseGroupRow).groupId)
    return detail
  }

  const create = async (invoiceIds: number[], patch: Record<string, unknown> = {}) =>
    track(
      await facade.create(admin, {
        ticketDate: TICKET_DATE,
        pieceworkVendorId: FRANCOL,
        invoiceIds,
        description: 'Prueba piecework',
        receiptNumber: 'PW-1',
        notes: SPEC_NOTES,
        ...patch,
      } as any),
    )

  const removeExpense = (detail: ExpenseDetail) =>
    detail.kind === 'group' ? facade.removeGroup(admin, (detail as ExpenseGroupRow).groupId) : facade.remove(admin, detail.id)

  const restoreExpense = (detail: ExpenseDetail) =>
    detail.kind === 'group' ? facade.restoreGroup(admin, (detail as ExpenseGroupRow).groupId) : facade.restore(admin, detail.id)

  const serviceRowsOf = async (desde: string, hasta: string): Promise<ServiceRow[]> => {
    const rows: { idInvoice: unknown; idService: unknown; idDealer: unknown; workDate: unknown; piecework: unknown }[] = await srs.query(
      SERVICE_PIECEWORK_SQL,
      [FRANCOL, FRANCOL, PROVIDER, FRANCOL, desde, hasta],
    )
    return rows
      .map((r) => ({
        idInvoice: Number(r.idInvoice),
        idService: Number(r.idService),
        idDealer: Number(r.idDealer),
        workDate: String(r.workDate),
        cents: toCents(Number(r.piecework)),
      }))
      .filter((r) => r.cents !== 0)
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
        SrsExpenseModule,
        SrsMonthlyClosingModule,
      ],
    }).compile()
    db = moduleRef.get(DataSource)
    srs = moduleRef.get(`${SRS_CONNECTION}DataSource`) as DataSource
    facade = moduleRef.get(ExpenseFacadeService)
    piecework = moduleRef.get(ExpensePieceworkService)
    closing = moduleRef.get(MonthlyClosingService, { strict: false })
    report = moduleRef.get(ExpenseReportRepository, { strict: false })
    permissions = moduleRef.get(SrsPermissionRepository, { strict: false })

    const [max]: { m: unknown }[] = await db.query(`SELECT IFNULL(MAX(id), 0) AS m FROM EXP_EXPENSE_PIECEWORK_WO`)
    maxPieceworkRowId = Number(max.m)
    catalogBefore = (
      await db.query(
        `SELECT id, estado FROM GENERIC_DATA
          WHERE id_dealer_provider = ? AND ((id_categoria = ? AND LOWER(TRIM(name)) = LOWER(?)) OR (id_categoria = ? AND LOWER(TRIM(name)) = LOWER(?)))`,
        [PROVIDER, EXPENSES_COMPANY_CATEGORY, 'Francol Services LLC', EXPENSES_CATEGORY_CATEGORY, PIECEWORK_EXPENSE_CATEGORY],
      )
    ).map((r: { id: unknown; estado: unknown }) => ({ id: Number(r.id), estado: Number(r.estado) }))

    // Otras expenses Piecework de Francol que ya estén en la copia (de otra prueba o a mano) no se tocan: sus WO no
    // están en la tabla y el cierre se compara antes/después.
    const dealers: { id: number }[] = await srs.query(
      `SELECT c.id FROM CONTRATISTA c WHERE c.estado = 1 AND c.tipo_empresa = 1
         AND EXISTS (SELECT 1 FROM DEALER_REL dr WHERE dr.id_dealer_customer = c.id AND dr.id_dealer_provider = ?)
       ORDER BY c.id`,
      [PROVIDER],
    )
    allDealers = dealers.map((r) => r.id).join(',')
    before = await closing.getSummary(admin, closingQuery())
  }, 300000)

  afterAll(async () => {
    const errors: unknown[] = []
    const step = async (fn: () => Promise<unknown>) => {
      try {
        await fn()
      } catch (e) {
        errors.push(e)
      }
    }
    if (db?.isInitialized) {
      // Lo seguido en el camino y, por si un alta falló a mitad, toda expense con filas de Francol creadas acá.
      await step(async () => {
        const extra: { id: unknown }[] = await db.query(
          `SELECT DISTINCT pw.id_expense AS id FROM EXP_EXPENSE_PIECEWORK_WO pw JOIN EXP_EXPENSE e ON e.id = pw.id_expense
            WHERE pw.id > ? AND pw.id_employee = ? AND e.id_created_by = ? AND e.notes = ?`,
          [maxPieceworkRowId, FRANCOL, ADMIN_USER, SPEC_NOTES],
        )
        for (const r of extra) createdExpenseIds.add(Number(r.id))
      })
      const expenseIds = [...createdExpenseIds]
      if (expenseIds.length) {
        const inExp = expenseIds.map(() => '?').join(',')
        await step(async () => {
          const groups: { g: unknown }[] = await db.query(
            `SELECT DISTINCT id_exp_group AS g FROM EXP_EXPENSE WHERE id IN (${inExp}) AND id_exp_group IS NOT NULL`,
            expenseIds,
          )
          for (const r of groups) createdGroupIds.add(Number(r.g))
        })
        const groupIds = [...createdGroupIds]
        const inGrp = groupIds.length ? groupIds.map(() => '?').join(',') : 'NULL'
        await step(() => db.query(`DELETE FROM LOG_GENERIC WHERE id_expense IN (${inExp}) OR id_exp_group IN (${inGrp})`, [...expenseIds, ...groupIds]))
        // T5b (migration 034): el histórico apunta a las filas; va primero.
        await step(() => db.query(`DELETE FROM EXP_EXPENSE_PIECEWORK_WO_HISTORY WHERE id_expense IN (${inExp})`, expenseIds))
        await step(() => db.query(`DELETE FROM EXP_EXPENSE_PIECEWORK_WO WHERE id_expense IN (${inExp})`, expenseIds))
        if (groupIds.length) await step(() => db.query(`UPDATE EXP_EXPENSE_GROUP SET id_attachment_expense = NULL WHERE id IN (${inGrp})`, groupIds))
        await step(() => db.query(`DELETE FROM EXP_EXPENSE WHERE id IN (${inExp}) AND id_detailer = ?`, [...expenseIds, PROVIDER]))
        if (groupIds.length) await step(() => db.query(`DELETE FROM EXP_EXPENSE_GROUP WHERE id IN (${inGrp}) AND id_detailer = ?`, [...groupIds, PROVIDER]))
      }
      // La compañía y la categoría: las creadas acá se borran si nada más las usa; una reactivada vuelve a estar inactiva.
      await step(async () => {
        const now: { id: unknown; estado: unknown }[] = await db.query(
          `SELECT id, estado FROM GENERIC_DATA
            WHERE id_dealer_provider = ? AND ((id_categoria = ? AND LOWER(TRIM(name)) = LOWER(?)) OR (id_categoria = ? AND LOWER(TRIM(name)) = LOWER(?)))`,
          [PROVIDER, EXPENSES_COMPANY_CATEGORY, 'Francol Services LLC', EXPENSES_CATEGORY_CATEGORY, PIECEWORK_EXPENSE_CATEGORY],
        )
        const prior = new Map(catalogBefore.map((c) => [c.id, c.estado]))
        for (const r of now) {
          const id = Number(r.id)
          if (prior.has(id)) {
            if (prior.get(id) !== Number(r.estado)) await db.query(`UPDATE GENERIC_DATA SET estado = ? WHERE id = ?`, [prior.get(id), id])
            continue
          }
          const [used]: { c: unknown }[] = await db.query(
            `SELECT (SELECT COUNT(*) FROM EXP_EXPENSE WHERE id_company = ? OR id_category = ?)
                  + (SELECT COUNT(*) FROM EXP_EXPENSE_REPETITIVE WHERE id_company = ? OR id_category = ?)
                  + (SELECT COUNT(*) FROM GENERIC_DATA WHERE id_parent = ?) AS c`,
            [id, id, id, id, id],
          )
          if (Number(used.c) === 0) await db.query(`DELETE FROM GENERIC_DATA WHERE id = ? AND id_dealer_provider = ?`, [id, PROVIDER])
        }
      })
    }
    await moduleRef?.close()
    if (errors.length) throw errors[0]
  }, 120000)

  it('la tabla del modal: los pay periods de Monthly Closing de octubre y las WO con piecework, cada una igual a la consulta independiente', async () => {
    const result = await piecework.workOrders(admin, FRANCOL, MONTH)
    periods = result.periods
    october = result.workOrders
    const cc = await (closing as any).prepare(admin, { ...closingQuery(), scope: 'all' }, allDealers)
    expect(periods).toEqual(cc.periods.map((p: { desde: string; hasta: string }) => ({ desde: p.desde, hasta: p.hasta })))
    expect(periods).toEqual([
      { desde: '2026-10-01', hasta: '2026-10-15' },
      { desde: '2026-10-16', hasta: '2026-10-30' },
    ])
    expect(october.length).toBeGreaterThan(1)
    for (const wo of october) {
      expect(periods.some((p) => wo.date >= p.desde && wo.date <= p.hasta)).toBe(true)
      expect(toCents(wo.piecework)).toBeGreaterThan(0)
      expect(wo.dealer.name).not.toBe('')
      expect(wo.nro).not.toBe('')
    }

    // Consulta independiente: las mismas WO y el mismo piecework de cada una.
    serviceRows = await serviceRowsOf(periods[0].desde, periods[periods.length - 1].hasta)
    // Las WO de Francol que ya están en otra expense Piecework activa (si hay) no se ofrecen.
    const takenRows: { id: unknown }[] = await db.query(
      `SELECT DISTINCT pw.id_invoice AS id FROM EXP_EXPENSE_PIECEWORK_WO pw
         JOIN EXP_EXPENSE e ON e.id = pw.id_expense AND e.estado = 1 AND e.id_detailer = ?
        WHERE pw.deleted_at IS NULL AND pw.id_employee = ?`,
      [PROVIDER, FRANCOL],
    )
    const taken = new Set(takenRows.map((r) => Number(r.id)))
    const byInvoice = new Map<number, { cents: number; idDealer: number; workDate: string }>()
    let takenCents = 0
    for (const r of serviceRows) {
      if (taken.has(r.idInvoice)) {
        takenCents += r.cents
        continue
      }
      const acc = byInvoice.get(r.idInvoice) ?? { cents: 0, idDealer: r.idDealer, workDate: r.workDate }
      acc.cents += r.cents
      byInvoice.set(r.idInvoice, acc)
    }
    expect(october.map((w) => w.idInvoice).sort((a, b) => a - b)).toEqual([...byInvoice.keys()].sort((a, b) => a - b))
    for (const wo of october) {
      const ind = byInvoice.get(wo.idInvoice)!
      expect({ cents: toCents(wo.piecework), idDealer: wo.dealer.id, workDate: wo.date }).toEqual(ind)
    }

    // El piecework de la lista (más el de las WO ya tomadas) es el que el snapshot le contó a Francol en esos pay
    // periods: la misma fecha de la WO en las dos puntas.
    const [snap]: { cents: unknown }[] = await srs.query(
      `SELECT ROUND(SUM(monto) * 100) AS cents FROM PAYROLL_SNAPSHOT_DAY
        WHERE id_contratista = ? AND id_usuario = ? AND periodo_desde IN (${periods.map(() => '?').join(',')})`,
      [PROVIDER, FRANCOL, ...periods.map((p) => p.desde)],
    )
    expect(sumCents(october.map((w) => w.piecework)) + takenCents).toBe(Number(snap.cents))
  }, 180000)

  it('otro mes: noviembre empieza en el pay period del 31/10 y no repite ninguna WO de octubre', async () => {
    const november = await piecework.workOrders(admin, FRANCOL, '2026-11')
    expect(november.periods[0].desde).toBe('2026-10-31')
    const ids = new Set(october.map((w) => w.idInvoice))
    expect(november.workOrders.some((w) => ids.has(w.idInvoice))).toBe(false)
  }, 120000)

  it('sin el permiso 147 (usuario no admin con Add Expense): la tabla, los vendors y el alta dan 403', async () => {
    expect(await permissions.userHasRolAccion(withoutPermission, ROL_ACCION_EXPENSES_ADD)).toBe(true)
    expect(await permissions.userHasRolAccion(withoutPermission, ROL_ACCION_EXPENSES_PIECEWORK)).toBe(false)
    expect(await permissions.userHasRolAccion(admin, ROL_ACCION_EXPENSES_PIECEWORK)).toBe(true)
    await expect(piecework.workOrders(withoutPermission, FRANCOL, MONTH)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(piecework.vendors(withoutPermission)).rejects.toBeInstanceOf(ForbiddenException)
    const ids = october.slice(0, 1).map((w) => w.idInvoice)
    const e = await catchError(() =>
      facade.create(withoutPermission, { ticketDate: TICKET_DATE, pieceworkVendorId: FRANCOL, invoiceIds: ids } as any),
    )
    expect(e).toBeInstanceOf(ForbiddenException)
    const [rows]: { c: unknown }[] = await db.query(
      `SELECT COUNT(*) AS c FROM EXP_EXPENSE_PIECEWORK_WO pw JOIN EXP_EXPENSE e ON e.id = pw.id_expense WHERE pw.id > ? AND e.id_created_by = ?`,
      [maxPieceworkRowId, USER_WITHOUT_147],
    )
    expect(Number(rows.c)).toBe(0)
  }, 60000)

  it('alta con 2 WO (de 2 dealers si hay): una fila por dealer con la suma de sus WO y una fila por servicio en EXP_EXPENSE_PIECEWORK_WO', async () => {
    const dealers = [...new Set(october.map((w) => w.dealer.id))]
    chosen =
      dealers.length > 1
        ? dealers.slice(0, 2).map((d) => october.find((w) => w.dealer.id === d)!)
        : october.slice(0, 2)
    const vendorOk = await piecework.vendors(admin)
    expect(vendorOk.data.map((v) => v.id)).toContain(FRANCOL)

    first = await create(chosen.map((w) => w.idInvoice))
    const rows = rowsOf(first)
    const expectedByDealer = new Map<number, number>()
    for (const w of chosen) expectedByDealer.set(w.dealer.id, (expectedByDealer.get(w.dealer.id) ?? 0) + toCents(w.piecework))
    expect(first.kind).toBe(expectedByDealer.size > 1 ? 'group' : 'single')
    expect(new Map(rows.map((r) => [r.dealer.id, toCents(r.amount)]))).toEqual(expectedByDealer)
    for (const r of rows) {
      expect(r.company.name).toBe('Francol Services LLC')
      expect(r.category.name).toBe(PIECEWORK_EXPENSE_CATEGORY)
      expect(r.status).toBe('pending')
      expect(r.piecework).toBe(true)
      expect(r.ticketDate).toBe(TICKET_DATE)
      expect(r.author.id).toBe(ADMIN_USER)
    }

    const expenseIds = rows.map((r) => r.id)
    const db0: { id: unknown; amount: unknown; estado: unknown; is_approved: unknown; id_detailer: unknown; id_dealer: unknown }[] = await db.query(
      `SELECT id, amount, estado, is_approved, id_detailer, id_dealer FROM EXP_EXPENSE WHERE id IN (${expenseIds.map(() => '?').join(',')})`,
      expenseIds,
    )
    for (const r of db0) {
      expect({ estado: Number(r.estado), approved: r.is_approved, detailer: Number(r.id_detailer) }).toEqual({ estado: 1, approved: null, detailer: PROVIDER })
      expect(toCents(Number(r.amount))).toBe(expectedByDealer.get(Number(r.id_dealer)))
    }

    // Una fila por servicio, igual a la consulta independiente, cada una con la fila de EXP_EXPENSE de su dealer.
    const expenseOfDealer = new Map(rows.map((r) => [r.dealer.id, r.id]))
    const saved: { id_expense: unknown; id_invoice: unknown; id_invoice_service: unknown; id_employee: unknown; id_dealer: unknown; amount: unknown; work_date: unknown }[] =
      await db.query(
        `SELECT id_expense, id_invoice, id_invoice_service, id_employee, id_dealer, amount, DATE_FORMAT(work_date, '%Y-%m-%d') AS work_date
           FROM EXP_EXPENSE_PIECEWORK_WO WHERE id_expense IN (${expenseIds.map(() => '?').join(',')}) ORDER BY id_invoice, id_invoice_service`,
        expenseIds,
      )
    const chosenIds = new Set(chosen.map((w) => w.idInvoice))
    const expected = serviceRows
      .filter((r) => chosenIds.has(r.idInvoice))
      .sort((a, b) => a.idInvoice - b.idInvoice || a.idService - b.idService)
      .map((r) => ({ idExpense: expenseOfDealer.get(r.idDealer), idInvoice: r.idInvoice, idService: r.idService, idEmployee: FRANCOL, idDealer: r.idDealer, cents: r.cents, workDate: r.workDate }))
    expect(
      saved.map((s) => ({
        idExpense: Number(s.id_expense),
        idInvoice: Number(s.id_invoice),
        idService: Number(s.id_invoice_service),
        idEmployee: Number(s.id_employee),
        idDealer: Number(s.id_dealer),
        cents: toCents(Number(s.amount)),
        workDate: String(s.work_date),
      })),
    ).toEqual(expected)

    const logs: { description: string }[] = await db.query(
      `SELECT description FROM LOG_GENERIC WHERE id_expense IN (${expenseIds.map(() => '?').join(',')}) ORDER BY id`,
      expenseIds,
    )
    expect(logs.some((l) => /^Piecework expense created \(\$\d+\.\d{2}\)$/.test(l.description))).toBe(true)
  }, 120000)

  it('esas WO ya no están en la tabla; volver a mandarlas, una WO de otro mes o un empleado que no es vendor, dan error en su campo', async () => {
    const now = await piecework.workOrders(admin, FRANCOL, MONTH)
    const chosenIds = new Set(chosen.map((w) => w.idInvoice))
    expect(now.workOrders.some((w) => chosenIds.has(w.idInvoice))).toBe(false)
    expect(now.workOrders).toHaveLength(october.length - chosen.length)

    const again = await catchError(() => create([chosen[0].idInvoice]))
    expect(fieldError(again)).toEqual({ field: 'invoiceIds', message: MSG_WORK_ORDER_NOT_AVAILABLE })

    const september = await piecework.workOrders(admin, FRANCOL, '2026-09')
    expect(september.workOrders.length).toBeGreaterThan(0)
    const otherMonth = await catchError(() => create([september.workOrders[0].idInvoice]))
    expect(fieldError(otherMonth)).toEqual({ field: 'invoiceIds', message: MSG_WORK_ORDER_NOT_AVAILABLE })
    // Una WO libre de octubre junto con una de septiembre: tampoco (no se graba la mitad).
    const mixed = await catchError(() => create([now.workOrders[0].idInvoice, september.workOrders[0].idInvoice]))
    expect(fieldError(mixed).field).toBe('invoiceIds')

    const notVendor = await catchError(() => create([now.workOrders[0].idInvoice], { pieceworkVendorId: ADMIN_USER }))
    expect(fieldError(notVendor)).toEqual({ field: 'pieceworkVendorId', message: MSG_CHOOSE_VENDOR })
    const [rows]: { c: unknown }[] = await db.query(
      `SELECT COUNT(DISTINCT pw.id_expense) AS c FROM EXP_EXPENSE_PIECEWORK_WO pw JOIN EXP_EXPENSE e ON e.id = pw.id_expense
        WHERE pw.id > ? AND e.id_created_by = ? AND e.notes = ?`,
      [maxPieceworkRowId, ADMIN_USER, SPEC_NOTES],
    )
    expect(Number(rows.c)).toBe(rowsOf(first).length)
  }, 180000)

  it('lo que leen los cierres: el piecework por dealer y día, y en Tint nada (Francol no es tintero)', async () => {
    const rows = await report.pieceworkInExpenses(PROVIDER, periods[0].desde, periods[periods.length - 1].hasta)
    const francol = new Map(rows.filter((r) => r.idUsuario === FRANCOL).map((r) => [`${r.idDealer}|${r.workDate}`, toCents(r.amount)]))
    // Lo de esta expense está, por dealer y día...
    const ours = new Map<string, number>()
    for (const w of chosen) ours.set(`${w.dealer.id}|${w.date}`, (ours.get(`${w.dealer.id}|${w.date}`) ?? 0) + toCents(w.piecework))
    for (const [k, c] of ours) expect(francol.get(k) ?? 0).toBeGreaterThanOrEqual(c)
    // ...y el total es el de las filas activas de Francol, por SQL independiente.
    const ind: { k: string; cents: unknown }[] = await db.query(
      `SELECT CONCAT(pw.id_dealer, '|', DATE_FORMAT(pw.work_date, '%Y-%m-%d')) AS k, ROUND(SUM(pw.amount) * 100) AS cents
         FROM EXP_EXPENSE_PIECEWORK_WO pw JOIN EXP_EXPENSE e ON e.id = pw.id_expense AND e.estado = 1 AND e.id_detailer = ?
        WHERE pw.deleted_at IS NULL AND pw.id_employee = ? AND pw.work_date BETWEEN ? AND ?
        GROUP BY k`,
      [PROVIDER, FRANCOL, periods[0].desde, periods[periods.length - 1].hasta],
    )
    expect(francol).toEqual(new Map(ind.map((r) => [r.k, Number(r.cents)])))

    const tinters: { id: unknown }[] = await srs.query(
      `SELECT DISTINCT ur.id_usuario AS id FROM USUARIO_ROL_REL ur JOIN ROL r ON r.id_rol = ur.id_rol
         JOIN usuarios u ON u.id_usuario = ur.id_usuario
        WHERE r.id_compania_owner = ? AND u.id_contratista_owner = ? AND LOWER(r.nombre) LIKE '%tint%'`,
      [PROVIDER, PROVIDER],
    )
    const tinterIds = tinters.map((t) => Number(t.id))
    expect(tinterIds).not.toContain(FRANCOL)
    await expect(
      report.pieceworkInExpenses(PROVIDER, periods[0].desde, periods[periods.length - 1].hasta, { employeeIds: tinterIds, serviceLike: TINT_SERVICE_FRAGMENT }),
    ).resolves.toEqual([])
    const cc = await (closing as any).prepare(admin, { ...closingQuery(), scope: 'tint' }, allDealers)
    await expect(report.pieceworkServiceLines(cc.expenseFilter, cc.employeeIds, TINT_SERVICE_FRAGMENT)).resolves.toEqual([])
  }, 120000)

  it('Monthly Closing de octubre: en cada dealer de la expense el Payroll baja el piecework de esas WO y Expenses sube la fila; lo demás igual', async () => {
    const after = await closing.getSummary(admin, closingQuery())
    const [cfg]: { pct: unknown }[] = await srs.query(`SELECT IFNULL(daily_report_payroll_tax, 0) AS pct FROM CONTRATISTA WHERE id = ?`, [PROVIDER])
    const [vendor]: { tax: unknown }[] = await srs.query(`SELECT payroll_tax AS tax FROM usuarios WHERE id_usuario = ?`, [FRANCOL])
    const pct = Number(cfg.pct)
    const taxed = Number(vendor.tax) === 1 && pct > 0
    // Hoy en la copia: Francol sin payroll_tax y Auto Wax sin %, así que no hay tax que restar.
    expect(taxed).toBe(false)

    // Lo que se resta, por dealer, como el snapshot: piecework + tax por dealer y pay period.
    const byKey = new Map<string, number>()
    for (const w of chosen) {
      const p = periods.find((x) => w.date >= x.desde && w.date <= x.hasta)!
      const k = `${w.dealer.id}|${p.desde}`
      byKey.set(k, (byKey.get(k) ?? 0) + toCents(w.piecework))
    }
    const deduction = new Map<number, number>()
    for (const [k, c] of byKey) {
      const dealer = Number(k.split('|')[0])
      const tax = taxed ? toCents((c / 100) * (pct / 100)) : 0
      deduction.set(dealer, (deduction.get(dealer) ?? 0) + c + tax)
    }

    const rows = rowsOf(first)
    for (const r of rows) {
      const b = before.rows.find((x) => x.dealerId === r.dealer.id)!
      const a = after.rows.find((x) => x.dealerId === r.dealer.id)!
      expect(toCents(b.payroll) - toCents(a.payroll)).toBe(deduction.get(r.dealer.id))
      expect(toCents(a.expenses) - toCents(b.expenses)).toBe(toCents(r.amount))
      expect(a.income).toBe(b.income)
      // Sin tax, lo que sale del Payroll entra en Expenses: el Profit/Loss del dealer no cambia.
      expect(a.profit).toBe(b.profit)
    }
    const touched = new Set(rows.map((r) => r.dealer.id))
    const others = (mc: MonthlyClosingDto) => mc.rows.filter((r) => !touched.has(r.dealerId))
    expect(others(after)).toEqual(others(before))
    expect(after.withoutDealer).toEqual(before.withoutDealer)

    const totalDeduction = [...deduction.values()].reduce((a, c) => a + c, 0)
    const totalExpense = sumCents(rows.map((r) => r.amount))
    expect(toCents(before.total.payroll) - toCents(after.total.payroll)).toBe(totalDeduction)
    expect(toCents(after.total.expenses) - toCents(before.total.expenses)).toBe(totalExpense)
    expect(after.total.income).toBe(before.total.income)
    // Total coherente: la suma de las filas más Without dealer.
    expect(toCents(after.total.payroll)).toBe(sumCents(after.rows.map((r) => r.payroll)) + toCents(after.withoutDealer?.payroll ?? 0))
    expect(toCents(after.total.expenses)).toBe(sumCents(after.rows.map((r) => r.expenses)))
    expect(toCents(after.total.profit)).toBe(toCents(after.total.income) - toCents(after.total.payroll) - toCents(after.total.expenses))

    // El detalle de cada dealer: Francol baja lo mismo, el Payroll suma la fila y la expense está en Expenses.
    for (const r of rows) {
      const d = await closing.getDealer(admin, r.dealer.id, closingQuery())
      const a = after.rows.find((x) => x.dealerId === r.dealer.id)!
      expect(sumCents(d.payroll.map((l) => l.amount))).toBe(toCents(a.payroll))
      expect(sumCents(d.expenses.map((l) => l.amount))).toBe(toCents(a.expenses))
      expect(d.expenses).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ vendor: 'Francol Services LLC', category: PIECEWORK_EXPENSE_CATEGORY, amount: Number(r.amount) }),
        ]),
      )
    }
  }, 600000)

  it('edición: description, receipt # y notes sí; monto o fecha, 409', async () => {
    const kind = first.kind
    const id = kind === 'group' ? (first as ExpenseGroupRow).groupId : first.id
    const edited = await facade.update(admin, id, {
      kind,
      ticketDate: TICKET_DATE,
      description: 'Prueba piecework editada',
      receiptNumber: 'PW-2',
      notes: 'notas nuevas',
    } as any)
    for (const r of rowsOf(edited)) {
      expect({ d: r.description, rn: r.receiptNumber, n: r.notes }).toEqual({ d: 'Prueba piecework editada', rn: 'PW-2', n: 'notas nuevas' })
    }
    expect(rowsOf(edited).map((r) => r.amount)).toEqual(rowsOf(first).map((r) => r.amount))

    const amount = await catchError(() => facade.update(admin, id, { kind, totalAmount: '1.00' } as any))
    expect(amount).toBeInstanceOf(ConflictException)
    expect((amount as Error).message).toBe(MSG_PIECEWORK_LOCKED)
    const date = await catchError(() => facade.update(admin, id, { kind, ticketDate: '2026-10-21' } as any))
    expect(date).toBeInstanceOf(ConflictException)
    const company = await catchError(() => facade.update(admin, id, { kind, newCompanyName: 'Otra compañía' } as any))
    expect(company).toBeInstanceOf(ConflictException)

    const [row]: { ticket_date: unknown; amount: unknown }[] = await db.query(
      `SELECT DATE_FORMAT(ticket_date, '%Y-%m-%d') AS ticket_date, amount FROM EXP_EXPENSE WHERE id = ?`,
      [rowsOf(first)[0].id],
    )
    expect({ date: row.ticket_date, cents: toCents(Number(row.amount)) }).toEqual({ date: TICKET_DATE, cents: toCents(rowsOf(first)[0].amount) })
  }, 120000)

  it('borrar libera las WO; con una tomada por otra expense, Restore da 409; liberada, Restore la vuelve a tomar', async () => {
    await removeExpense(first)
    const freed = await piecework.workOrders(admin, FRANCOL, MONTH)
    const chosenIds = chosen.map((w) => w.idInvoice)
    expect(chosenIds.every((id) => freed.workOrders.some((w) => w.idInvoice === id))).toBe(true)
    expect(freed.workOrders).toHaveLength(october.length)
    const ourIds = rowsOf(first).map((r) => r.id)
    const [left]: { c: unknown }[] = await db.query(
      `SELECT COUNT(*) AS c FROM EXP_EXPENSE_PIECEWORK_WO pw JOIN EXP_EXPENSE e ON e.id = pw.id_expense AND e.estado = 1
        WHERE pw.id_expense IN (${ourIds.map(() => '?').join(',')})`,
      ourIds,
    )
    expect(Number(left.c)).toBe(0)

    const second = await create([chosen[0].idInvoice])
    expect(sumCents(rowsOf(second).map((r) => r.amount))).toBe(toCents(chosen[0].piecework))

    const taken = await catchError(() => restoreExpense(first))
    expect(taken).toBeInstanceOf(ConflictException)
    expect((taken as Error).message).toBe(MSG_PIECEWORK_RESTORE_TAKEN)
    const ids = rowsOf(first).map((r) => r.id)
    const estados: { estado: unknown }[] = await db.query(`SELECT estado FROM EXP_EXPENSE WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
    expect(estados.every((r) => Number(r.estado) === 0)).toBe(true)

    await removeExpense(second)
    const restored = await restoreExpense(first)
    expect(rowsOf(restored).every((r) => !r.deleted)).toBe(true)
    const again = await piecework.workOrders(admin, FRANCOL, MONTH)
    expect(again.workOrders.some((w) => chosenIds.includes(w.idInvoice))).toBe(false)
  }, 180000)
})
