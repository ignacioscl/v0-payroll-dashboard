/**
 * T5b — «la expense Piecework sigue a sus WO» (plans/plan-reunion-juan-18-11 v9, tema 4, sección v6, D18–D20, reviews
 * R1–R4), contra la copia local de PROD del 12/11 (`srssui5_srs_20261112` en 127.0.0.1:3307) con las migrations 032 y
 * 034. Camino entero con **el job del snapshot de Payroll corrido a mano** (`PayrollSnapshotJob.run`, force, con rango):
 * se cambia la WO en la base como lo hace el legacy, corre el job y se mira la expense, su histórico y Monthly Closing.
 *
 * ESCRIBE de verdad (el Monthly Closing lee por otra conexión). En el afterAll deja todo como estaba, también si falla
 * algo: devuelve las WO tocadas a sus valores (estado, departamento, fecha, piecework del servicio, empleados), borra lo
 * creado (histórico, filas Piecework, expenses, grupos, LOG_GENERIC) y vuelve a correr el job de octubre y noviembre
 * para que el snapshot quede con los datos de siempre.
 *
 * Se salta solo, con aviso, si la base no es esa copia o si la migration 034 no se corrió.
 */
import 'dotenv/config'
import { execSync } from 'child_process'
import { ConfigModule } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { addTransactionalDataSource, initializeTransactionalContext } from 'typeorm-transactional'

import configuration from 'src/configuration'
import { dataSourceOptions } from 'src/typeorm.config'
import { SRS_CONNECTION, srsDataSourceOptions } from 'src/srs/srs.datasource'
import { JOBS_CONNECTION, jobsDataSourceOptions } from 'src/jobs/jobs.datasource'
import type { JobContext } from 'src/jobs/job.interface'
import { SrsContext } from 'src/srs/auth/srs-auth-context.service'
import type { ExpenseDetail, ExpenseGroupRow, ExpenseSingleRow } from 'src/srs/expenses/dto/expense-row.dto'
import { ExpenseReportService } from 'src/srs/expenses/service/expense-report.service'
import { SrsMonthlyClosingModule } from 'src/srs/monthly-closing/monthly-closing.module'
import { MonthlyClosingService } from 'src/srs/monthly-closing/service/monthly-closing.service'
import type { MonthlyClosingDto } from 'src/srs/monthly-closing/dto/monthly-closing.dto'
import { PayrollSnapshotJob } from 'src/srs/payroll/snapshot/payroll-snapshot.job'
import { PayrollSnapshotModule } from 'src/srs/payroll/snapshot/payroll-snapshot.module'
import { PIECEWORK_REASON } from './rules/expense-piecework-recalc'
import { toCents } from './rules/expense-rules'
import { ExpenseFacadeService } from './service/expense-facade.service'
import { ExpensePieceworkService } from './service/expense-piecework.service'
import { SrsExpenseModule } from './srs-expense.module'

const LOCAL_COPY = 'srssui5_srs_20261112'

function migration034Applied(): boolean {
  if (process.env.DB_DATABASE !== LOCAL_COPY || process.env.DB_PORT !== '3307') return false
  const sql = `SHOW TABLES LIKE 'EXP_EXPENSE_PIECEWORK_WO_HISTORY'`
  const env = { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD ?? '' }
  const attempts = [
    `/opt/homebrew/opt/mysql@8.0/bin/mysql -h 127.0.0.1 -P 3307 -u${process.env.DB_USERNAME} ${LOCAL_COPY} -N -e "${sql}"`,
    `docker exec -e MYSQL_PWD srs-mariadb mysql -u${process.env.DB_USERNAME} ${LOCAL_COPY} -N -e "${sql}"`,
  ]
  for (const cmd of attempts) {
    try {
      return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000, env }).toString().includes('EXP_EXPENSE_PIECEWORK_WO_HISTORY')
    } catch {
      // el siguiente cliente
    }
  }
  return false
}

const ready = migration034Applied()
if (!ready) {
  console.warn(`SKIPPED expense-piecework-recalc-integration.spec.ts: la base no es ${LOCAL_COPY} o falta la migration 034.`)
}
const describeIf = ready ? describe : describe.skip

const PROVIDER = 79 // Auto Wax
const ADMIN_USER = 76
const FRANCOL = 6985 // vendor; sus WO de octubre no tienen ponchada (R1)
const OTHER_EMPLOYEE = 76 // se suma a una WO para que el piecework se reparta
const MONTH = '2026-10'
const TICKET_DATE = '2026-10-20'
const SPEC_NOTES = 'expense-piecework-recalc-integration.spec'

/** WO de Francol de octubre (dealer 627), sin ponchada y libres en la copia del 12/11 (consulta del 22/11). */
const WO_A = 4354653 // 10/01, servicio 141023, $105 — pay period 10/01–10/15
const WO_A_SERVICE = 141023
const WO_B = 4379021 // 10/16, servicio 143063, $210 — pay period 10/16–10/30
const WO_C = 4382571 // 10/19, servicio 143063, $70 — la que se agrega en Edit
const DEALER = 627
const OTHER_DEPARTMENT = 1060 // departamento del dealer 613
const OTHER_DEALER = 613

const PERIOD_A = { desde: '2026-10-01', hasta: '2026-10-15' }
const PERIOD_B = { desde: '2026-10-16', hasta: '2026-10-30' }

const admin: SrsContext = { idUsuario: ADMIN_USER, idUsuarioRolrel: null, idRol: 2, idDealerProvider: PROVIDER, isUserDealer: false, isActive: true }

function rowsOf(detail: ExpenseDetail): ExpenseSingleRow[] {
  return detail.kind === 'group' ? (detail as ExpenseGroupRow).rows : [detail as ExpenseSingleRow]
}

const jobCtx: JobContext = { runId: 0 /* se pisa en el beforeAll con una corrida de JOB_RUN (FK de PAYROLL_PERIOD_STATE) */, trigger: 'manual' as JobContext['trigger'], dryRun: false, force: true, log: async () => undefined }

describeIf('T5b — la expense Piecework sigue a sus WO (job corrido a mano, escribe y limpia)', () => {
  let moduleRef: TestingModule
  let db: DataSource
  let facade: ExpenseFacadeService
  let piecework: ExpensePieceworkService
  let closing: MonthlyClosingService
  let reportService: ExpenseReportService
  let job: PayrollSnapshotJob
  let allDealers: string

  let original: { id: number; estado: number; idDepartment: number; fechaAlta: string }[] = []
  let originalServicePiecework: string | null = null
  let insertedEmployeeRel: number | null = null
  const createdExpenseIds = new Set<number>()
  const createdGroupIds = new Set<number>()
  let expenseId = 0

  const runJob = (desde: string, hasta: string) => job.run({ idContratista: PROVIDER, desde, hasta }, jobCtx)
  const closingNow = (): Promise<MonthlyClosingDto> => closing.getSummary(admin, { month: MONTH, idDealer: allDealers } as any)
  const dealerRow = (c: MonthlyClosingDto, id: number) => c.rows.find((r) => r.dealerId === id)!
  const detail = () => facade.get(admin, expenseId)
  const track = (d: ExpenseDetail) => {
    for (const r of rowsOf(d)) createdExpenseIds.add(r.id)
    if (d.kind === 'group') createdGroupIds.add((d as ExpenseGroupRow).groupId)
    return d
  }
  const pwRows = async (): Promise<{ id: number; idInvoice: number; amount: string; idDealer: number; workDate: string; deleted: boolean; idExpense: number }[]> =>
    (
      await db.query(
        `SELECT pw.id, pw.id_invoice AS idInvoice, pw.amount, pw.id_dealer AS idDealer, DATE_FORMAT(pw.work_date, '%Y-%m-%d') AS workDate,
                pw.deleted_at IS NOT NULL AS deleted, pw.id_expense AS idExpense
           FROM EXP_EXPENSE_PIECEWORK_WO pw WHERE pw.id_expense IN (${[...createdExpenseIds].join(',')}) ORDER BY pw.id`,
      )
    ).map((r: any) => ({ ...r, id: Number(r.id), idInvoice: Number(r.idInvoice), idDealer: Number(r.idDealer), deleted: Number(r.deleted) === 1, idExpense: Number(r.idExpense) }))
  const historyOf = async (idInvoice: number): Promise<{ reason: string; detail: string; oldAmount: string | null; newAmount: string; source: string }[]> =>
    db.query(
      `SELECT h.reason, h.detail, h.old_amount AS oldAmount, h.new_amount AS newAmount, h.source
         FROM EXP_EXPENSE_PIECEWORK_WO_HISTORY h JOIN EXP_EXPENSE e ON e.id = h.id_expense
        WHERE h.id_invoice = ? AND e.notes = ? ORDER BY h.id`,
      [idInvoice, SPEC_NOTES],
    )
  const totalCents = async () => rowsOf(await detail()).reduce((a, r) => a + toCents(r.amount), 0)

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
        TypeOrmModule.forRootAsync({ name: JOBS_CONNECTION, useFactory: () => jobsDataSourceOptions }),
        SrsExpenseModule,
        SrsMonthlyClosingModule,
        PayrollSnapshotModule,
      ],
    }).compile()
    db = moduleRef.get(DataSource)
    facade = moduleRef.get(ExpenseFacadeService)
    piecework = moduleRef.get(ExpensePieceworkService)
    closing = moduleRef.get(MonthlyClosingService, { strict: false })
    reportService = moduleRef.get(ExpenseReportService, { strict: false })
    job = moduleRef.get(PayrollSnapshotJob, { strict: false })
    const jobsDb = moduleRef.get(`${JOBS_CONNECTION}DataSource`) as DataSource
    const [lastRun]: { id: unknown }[] = await jobsDb.query(`SELECT MAX(id) AS id FROM JOB_RUN`)
    jobCtx.runId = Number(lastRun?.id ?? 0)

    original = (
      await db.query(
        `SELECT id, estado, id_department AS idDepartment, DATE_FORMAT(fecha_alta, '%Y-%m-%d %H:%i:%s') AS fechaAlta
           FROM INVOICE WHERE id IN (?, ?, ?) AND id_dealer_provider = ?`,
        [WO_A, WO_B, WO_C, PROVIDER],
      )
    ).map((r: any) => ({ id: Number(r.id), estado: Number(r.estado), idDepartment: Number(r.idDepartment), fechaAlta: String(r.fechaAlta) }))
    expect(original).toHaveLength(3)
    const [svc]: { piecework: unknown }[] = await db.query(
      `SELECT piecework FROM INVOICE_SERVICE_REL WHERE id_invoice = ? AND id_service_invoice = ?`,
      [WO_A, WO_A_SERVICE],
    )
    originalServicePiecework = svc.piecework === null ? null : String(svc.piecework)
    const dealers: { id: number }[] = await db.query(
      `SELECT c.id FROM CONTRATISTA c WHERE c.estado = 1 AND c.tipo_empresa = 1
         AND EXISTS (SELECT 1 FROM DEALER_REL dr WHERE dr.id_dealer_customer = c.id AND dr.id_dealer_provider = ?) ORDER BY c.id`,
      [PROVIDER],
    )
    allDealers = dealers.map((r) => r.id).join(',')
    // El snapshot de octubre, al día con la base antes de empezar.
    await runJob(PERIOD_A.desde, PERIOD_B.hasta)
  }, 600000)

  afterAll(async () => {
    const errors: unknown[] = []
    const step = async (fn: () => Promise<unknown>) => {
      try {
        await fn()
      } catch (e) {
        errors.push(e)
      }
    }
    delete process.env.PAYROLL_SNAPSHOT_CHECK_MONTHS
    if (db?.isInitialized) {
      for (const o of original) {
        await step(() =>
          db.query(`UPDATE INVOICE SET estado = ?, id_department = ?, fecha_alta = ? WHERE id = ? AND id_dealer_provider = ?`, [
            o.estado,
            o.idDepartment,
            o.fechaAlta,
            o.id,
            PROVIDER,
          ]),
        )
      }
      await step(() =>
        db.query(`UPDATE INVOICE_SERVICE_REL SET piecework = ? WHERE id_invoice = ? AND id_service_invoice = ?`, [
          originalServicePiecework,
          WO_A,
          WO_A_SERVICE,
        ]),
      )
      if (insertedEmployeeRel) await step(() => db.query(`DELETE FROM INVOICE_EMPLOYEE_REL WHERE id = ?`, [insertedEmployeeRel]))
      await step(async () => {
        const extra: { id: unknown; g: unknown }[] = await db.query(
          `SELECT id, id_exp_group AS g FROM EXP_EXPENSE WHERE id_detailer = ? AND notes = ? AND id_created_by = ?`,
          [PROVIDER, SPEC_NOTES, ADMIN_USER],
        )
        for (const r of extra) {
          createdExpenseIds.add(Number(r.id))
          if (r.g !== null) createdGroupIds.add(Number(r.g))
        }
      })
      const ids = [...createdExpenseIds]
      if (ids.length) {
        const inExp = ids.map(() => '?').join(',')
        const groups = [...createdGroupIds]
        const inGrp = groups.length ? groups.map(() => '?').join(',') : 'NULL'
        await step(() => db.query(`DELETE FROM EXP_EXPENSE_PIECEWORK_WO_HISTORY WHERE id_expense IN (${inExp})`, ids))
        await step(() => db.query(`DELETE FROM LOG_GENERIC WHERE id_expense IN (${inExp}) OR id_exp_group IN (${inGrp})`, [...ids, ...groups]))
        await step(() => db.query(`DELETE FROM EXP_EXPENSE_PIECEWORK_WO WHERE id_expense IN (${inExp})`, ids))
        if (groups.length) await step(() => db.query(`UPDATE EXP_EXPENSE_GROUP SET id_attachment_expense = NULL WHERE id IN (${inGrp})`, groups))
        await step(() => db.query(`DELETE FROM EXP_EXPENSE WHERE id IN (${inExp}) AND id_detailer = ?`, [...ids, PROVIDER]))
        if (groups.length) await step(() => db.query(`DELETE FROM EXP_EXPENSE_GROUP WHERE id IN (${inGrp}) AND id_detailer = ?`, [...groups, PROVIDER]))
      }
      // El snapshot vuelve a los datos de siempre (la WO C pasó por noviembre).
      await step(() => runJob(PERIOD_A.desde, '2026-11-15'))
    }
    await moduleRef?.close()
    if (errors.length) throw errors[0]
  }, 600000)

  it('alta con las WO A y B; la noche sin cambios en la WO no toca nada aunque el vendor no haya ponchado (R1)', async () => {
    const created = track(
      await facade.create(admin, {
        ticketDate: TICKET_DATE,
        pieceworkVendorId: FRANCOL,
        invoiceIds: [WO_A, WO_B],
        description: 'T5b',
        receiptNumber: 'PW-T5B',
        notes: SPEC_NOTES,
      } as any),
    )
    expenseId = rowsOf(created)[0].id
    expect(created.kind).toBe('single')
    const before = await totalCents()
    await runJob(PERIOD_A.desde, PERIOD_B.hasta)
    expect(await totalCents()).toBe(before)
    expect(await historyOf(WO_A)).toEqual([])
    expect(await historyOf(WO_B)).toEqual([])
    const [checked]: { c: unknown }[] = await db.query(
      `SELECT COUNT(*) AS c FROM EXP_EXPENSE_PIECEWORK_WO WHERE id_expense = ? AND checked_at IS NOT NULL AND src_employee_count = 1`,
      [expenseId],
    )
    expect(Number(checked.c)).toBe(2)
  }, 600000)

  it('cambia el piecework del servicio: la expense cambia sola, queda el motivo y Monthly Closing sigue cerrando (Payroll igual, Expenses +$50)', async () => {
    const closingBefore = await closingNow()
    await db.query(`UPDATE INVOICE_SERVICE_REL SET piecework = 155 WHERE id_invoice = ? AND id_service_invoice = ?`, [WO_A, WO_A_SERVICE])
    await runJob(PERIOD_A.desde, PERIOD_A.hasta)
    const rows = await pwRows()
    expect(toCents(rows.find((r) => r.idInvoice === WO_A)!.amount)).toBe(15500)
    expect(await historyOf(WO_A)).toEqual([
      { reason: PIECEWORK_REASON.servicePiecework, detail: 'service_piecework:105.00>155.00', oldAmount: '105.00', newAmount: '155.00', source: 'nightly' },
    ])
    const closingAfter = await closingNow()
    expect(dealerRow(closingAfter, DEALER).payroll).toBe(dealerRow(closingBefore, DEALER).payroll)
    expect(toCents(dealerRow(closingAfter, DEALER).expenses) - toCents(dealerRow(closingBefore, DEALER).expenses)).toBe(5000)
  }, 600000)

  it('WO eliminada → $0 con su motivo y no se libera; activa de nuevo → vuelve con su monto', async () => {
    await db.query(`UPDATE INVOICE SET estado = 0 WHERE id = ?`, [WO_A])
    await runJob(PERIOD_A.desde, PERIOD_A.hasta)
    let a = (await pwRows()).find((r) => r.idInvoice === WO_A)!
    expect([toCents(a.amount), a.deleted]).toEqual([0, false])
    const free = await piecework.workOrders(admin, FRANCOL, MONTH)
    expect(free.workOrders.some((w) => w.idInvoice === WO_A)).toBe(false)
    await db.query(`UPDATE INVOICE SET estado = 1 WHERE id = ?`, [WO_A])
    await runJob(PERIOD_A.desde, PERIOD_A.hasta)
    a = (await pwRows()).find((r) => r.idInvoice === WO_A)!
    expect(toCents(a.amount)).toBe(15500)
    expect((await historyOf(WO_A)).slice(-2).map((h) => h.reason)).toEqual([PIECEWORK_REASON.woDeleted, PIECEWORK_REASON.woActiveAgain])
  }, 600000)

  it('otro empleado en la WO: el piecework se reparte y el motivo lo dice', async () => {
    const res: { insertId: number } = await db.query(`INSERT INTO INVOICE_EMPLOYEE_REL (id_invoice, id_usuario) VALUES (?, ?)`, [WO_A, OTHER_EMPLOYEE])
    insertedEmployeeRel = Number(res.insertId)
    await runJob(PERIOD_A.desde, PERIOD_A.hasta)
    expect(toCents((await pwRows()).find((r) => r.idInvoice === WO_A)!.amount)).toBe(7750)
    expect((await historyOf(WO_A)).at(-1)).toMatchObject({ reason: PIECEWORK_REASON.employeeCount, detail: 'employee_count:1>2' })
    await db.query(`DELETE FROM INVOICE_EMPLOYEE_REL WHERE id = ?`, [insertedEmployeeRel])
    insertedEmployeeRel = null
    await runJob(PERIOD_A.desde, PERIOD_A.hasta)
    expect(toCents((await pwRows()).find((r) => r.idInvoice === WO_A)!.amount)).toBe(15500)
  }, 600000)

  it('la WO cambia de dealer: el monto pasa al dealer nuevo (la expense pasa a grupo) y el Payroll de cada dealer no cambia', async () => {
    const closingBefore = await closingNow()
    await db.query(`UPDATE INVOICE SET id_department = ? WHERE id = ?`, [OTHER_DEPARTMENT, WO_B])
    await runJob(PERIOD_B.desde, PERIOD_B.hasta)
    const d = track(await detail())
    expect(d.kind).toBe('group')
    const byDealer = new Map(rowsOf(d).map((r) => [r.dealer.id, toCents(r.amount)]))
    expect(byDealer.get(DEALER)).toBe(15500)
    expect(byDealer.get(OTHER_DEALER)).toBe(21000)
    expect((await historyOf(WO_B)).at(-1)).toMatchObject({ reason: PIECEWORK_REASON.dealer })
    const closingAfter = await closingNow()
    for (const id of [DEALER, OTHER_DEALER]) expect(dealerRow(closingAfter, id).payroll).toBe(dealerRow(closingBefore, id).payroll)
    // vuelve a su dealer
    await db.query(`UPDATE INVOICE SET id_department = ? WHERE id = ?`, [original.find((o) => o.id === WO_B)!.idDepartment, WO_B])
    await runJob(PERIOD_B.desde, PERIOD_B.hasta)
    const back = new Map(rowsOf(await detail()).map((r) => [r.dealer.id, toCents(r.amount)]))
    expect(back.get(DEALER)).toBe(15500 + 21000)
    expect(back.get(OTHER_DEALER)).toBe(0)
  }, 600000)

  it('Edit (D18): agrega la WO C y saca la A; la A queda libre; el histórico dice quién; el filtro «Piecework con cambios» la trae', async () => {
    const view = await facade.pieceworkWorkOrders(admin, expenseId)
    expect(view.canEdit).toBe(true)
    expect(view.workOrders.filter((w) => w.selected).map((w) => w.idInvoice).sort()).toEqual([WO_A, WO_B].sort())
    expect(view.workOrders.some((w) => w.idInvoice === WO_C && !w.selected)).toBe(true)
    await facade.updatePieceworkWorkOrders(admin, expenseId, [WO_B, WO_C])
    expect((await historyOf(WO_A)).at(-1)).toMatchObject({ reason: PIECEWORK_REASON.editRemoved, source: 'edit' })
    expect((await historyOf(WO_C)).at(-1)).toMatchObject({ reason: PIECEWORK_REASON.editAdded, source: 'edit', oldAmount: null, newAmount: '70.00' })
    expect(await totalCents()).toBe(21000 + 7000)
    const free = await piecework.workOrders(admin, FRANCOL, MONTH)
    expect(free.workOrders.some((w) => w.idInvoice === WO_A)).toBe(true)
    const after = await facade.pieceworkWorkOrders(admin, expenseId)
    expect(after.history[0].source).toBe('edit')
    expect(after.history[0].changedBy?.id).toBe(ADMIN_USER)
    const list = await reportService.list(admin, {
      idDealer: allDealers,
      from: '2026-10-01',
      to: '2026-10-31',
      type: 'piecework',
      changed: '1',
      pageSize: 200,
    } as any)
    const listed = list.data.find((r) => (r.kind === 'group' ? (r as ExpenseGroupRow).rows.some((x) => x.id === expenseId) : r.id === expenseId))
    expect(listed?.pieceworkChanged).toBe(true)
  }, 600000)

  it('R2: la WO pasa a un pay period que el Payroll ya no recalcula → queda en $0 en el suyo, sin liberarse', async () => {
    // Ventana de un mes: con corte 20/11, 10/16–10/30 está vivo y 10/01–10/15 congelado.
    process.env.PAYROLL_SNAPSHOT_CHECK_MONTHS = '1'
    const closingBefore = await closingNow()
    await db.query(`UPDATE INVOICE SET fecha_alta = '2026-10-05 10:00:00' WHERE id = ?`, [WO_B])
    await runJob(PERIOD_B.desde, PERIOD_B.hasta)
    const b = (await pwRows()).find((r) => r.idInvoice === WO_B && !r.deleted)!
    expect([toCents(b.amount), b.workDate, b.deleted]).toEqual([0, '2026-10-16', false])
    expect((await historyOf(WO_B)).at(-1)).toMatchObject({ reason: PIECEWORK_REASON.movedFrozen, detail: 'moved_frozen:2026-10-16>2026-10-05' })
    const closingAfter = await closingNow()
    expect(dealerRow(closingAfter, DEALER).payroll).toBe(dealerRow(closingBefore, DEALER).payroll)
    delete process.env.PAYROLL_SNAPSHOT_CHECK_MONTHS
    await db.query(`UPDATE INVOICE SET fecha_alta = ? WHERE id = ?`, [original.find((o) => o.id === WO_B)!.fechaAlta, WO_B])
    await runJob(PERIOD_A.desde, PERIOD_B.hasta)
    expect(toCents((await pwRows()).find((r) => r.idInvoice === WO_B && !r.deleted)!.amount)).toBe(21000)
  }, 600000)

  it('D20: la WO C pasa a noviembre → sale de la expense y queda libre para la de noviembre', async () => {
    await db.query(`UPDATE INVOICE SET fecha_alta = '2026-11-05 10:00:00' WHERE id = ?`, [WO_C])
    await runJob(PERIOD_B.desde, PERIOD_B.hasta)
    const c = (await pwRows()).find((r) => r.idInvoice === WO_C)!
    expect(c.deleted).toBe(true)
    expect((await historyOf(WO_C)).at(-1)).toMatchObject({ reason: PIECEWORK_REASON.movedOut, detail: 'moved_out:2026-10-19>2026-11-05' })
    expect(await totalCents()).toBe(21000)
    const november = await piecework.workOrders(admin, FRANCOL, '2026-11')
    expect(november.workOrders.some((w) => w.idInvoice === WO_C)).toBe(true)
  }, 600000)

  it('sin ninguna WO, la expense sigue siendo Piecework (R3): marca, editor de WO y $0', async () => {
    await facade.updatePieceworkWorkOrders(admin, expenseId, [])
    const d = await detail()
    expect(d.piecework).toBe(true)
    expect(await totalCents()).toBe(0)
    const view = await facade.pieceworkWorkOrders(admin, expenseId)
    expect(view.workOrders.some((w) => w.selected)).toBe(false)
    expect(view.vendor?.id).toBe(FRANCOL)
  }, 600000)
})
