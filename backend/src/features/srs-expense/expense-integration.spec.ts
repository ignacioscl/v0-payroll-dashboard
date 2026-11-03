/**
 * Integración de Expenses contra la copia local de PROD (`srssui5_srs_20261030` en 127.0.0.1:3307), T10.5 del
 * plan. Todo corre en una transacción que se deshace al final de cada test (runInTransaction + un error propio):
 * nada queda grabado. Se salta solo, con aviso, si la base no es la copia local o si la migration 020 todavía no
 * se corrió (SHOW TABLES LIKE 'EXP_EXPENSE_GROUP' vacío).
 */
import 'dotenv/config'
import { execSync } from 'child_process'
import { PassThrough } from 'stream'
import ExcelJS from 'exceljs'
import type { Response } from 'express'
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { addTransactionalDataSource, initializeTransactionalContext, runInTransaction } from 'typeorm-transactional'

import configuration from 'src/configuration'
import { dataSourceOptions } from 'src/typeorm.config'
import { SRS_CONNECTION, srsDataSourceOptions } from 'src/srs/srs.datasource'
import { DataError } from 'src/commons/errors/data.error'
import { SrsContext } from 'src/srs/auth/srs-auth-context.service'
import { SrsPermissionRepository } from 'src/srs/auth/srs-permission.repository'
import { SrsExpensesModule } from 'src/srs/expenses/srs-expenses.module'
import { ExpenseReportService } from 'src/srs/expenses/service/expense-report.service'
import { ExpenseReportRepository } from 'src/srs/expenses/repository/expense-report.repository'
import { buildExpenseListFilter } from 'src/srs/expenses/expense-list-filter'
import type { ExpenseGroupRow, ExpenseSingleRow } from 'src/srs/expenses/dto/expense-row.dto'
import { SrsGenericDataModule } from 'src/features/srs-generic-data/srs-generic-data.module'
import { ExpenseCatalogService } from 'src/features/srs-generic-data/service/expense-catalog.service'
import { ExpenseGroupModule } from 'src/features/expense-group/expense-group.module'
import { SrsExpenseRepetitiveModule } from 'src/features/srs-expense-repetitive/srs-expense-repetitive.module'
import { RecurringExpenseFacadeService } from 'src/features/srs-expense-repetitive/service/recurring-expense-facade.service'
import { SrsExpenseDealerAssignModule } from 'src/features/srs-expense-dealer-assign/srs-expense-dealer-assign.module'
import { SrsLogGenericModule } from 'src/features/srs-log-generic/srs-log-generic.module'
import { SrsLogChangeModule } from 'src/features/srs-log-change/srs-log-change.module'
import { EXPENSE_ESTADO_RETIRED, msgPercentsSum, msgSumOver100, MSG_BRANCH_OUT_OF_SCOPE, MSG_SOME_BRANCHES_OUTSIDE } from './rules/expense-rules'
import { ExpenseFacadeService } from './service/expense-facade.service'
import { SrsExpenseModule } from './srs-expense.module'

const LOCAL_COPY = 'srssui5_srs_20261030'

/** Sin escribir en la base: solo SHOW TABLES, por el contenedor local o el cliente de Homebrew. */
function migration020Applied(): boolean {
  if (process.env.DB_DATABASE !== LOCAL_COPY || process.env.DB_PORT !== '3307') return false
  const sql = `SHOW TABLES LIKE 'EXP_EXPENSE_GROUP'`
  const attempts = [
    `docker exec srs-mariadb mysql -u${process.env.DB_USERNAME} -p${process.env.DB_PASSWORD} ${LOCAL_COPY} -N -e "${sql}"`,
    `/opt/homebrew/opt/mysql@8.0/bin/mysql -h 127.0.0.1 -P 3307 -u${process.env.DB_USERNAME} -p${process.env.DB_PASSWORD} ${LOCAL_COPY} -N -e "${sql}"`,
  ]
  for (const cmd of attempts) {
    try {
      const out = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }).toString()
      if (out.includes('EXP_EXPENSE_GROUP')) return true
      return false
    } catch {
      // probar el siguiente cliente
    }
  }
  return false
}

const ready = migration020Applied()
if (!ready) {
  console.warn(
    `SKIPPED expense-integration.spec.ts: la base no es la copia local ${LOCAL_COPY} en 127.0.0.1:3307 o la migration 020 ` +
      `(EXP_EXPENSE_GROUP) todavía no se corrió. Correrla: docker exec -i srs-mariadb mysql -usrssui5_srs -p... ${LOCAL_COPY} < public/sql/migrations/020_expenses_pro.sql`,
  )
}
const describeIf = ready ? describe : describe.skip

/** Fixtures de la copia del 30/10 (Auto Wax = 79). */
const PROVIDER = 79
const DEALER_A = 408 // Acura of Melbourne
const DEALER_B = 86 // AutoNation Honda Miami Lakes
const DEALER_C = 76 // AutoNation Mercedes-Benz of Pompano
const OTHER_PROVIDER = 188 // GC Installations
const OTHER_DEALER = 186 // dealer de GC que no es de Auto Wax
const COMPANY_1 = 329 // The Home Depot
const COMPANY_2 = 330 // Harbor Freight Tools
const CATEGORY_1 = 485 // Body Shop Work
const CATEGORY_2 = 486 // USPS Shipping Cost
const EMPLOYEE_ON_A = 137 // empleado de Auto Wax asignado a 408
const ADMIN_USER = 76 // Javier Maldonado, Admin Company de Auto Wax
const RESTRICTED_USER = 4972 // Cesar David Lizardo Martinez: ve 408, no ve 86
const TICKET_DATE = '2015-06-15'

const admin: SrsContext = { idUsuario: ADMIN_USER, idUsuarioRolrel: null, idRol: 2, idDealerProvider: PROVIDER, isUserDealer: false, isActive: true }
const restricted: SrsContext = { ...admin, idUsuario: RESTRICTED_USER, idRol: 5 }
const otherCompany: SrsContext = { ...admin, idDealerProvider: OTHER_PROVIDER }

class Rollback extends Error {}

/** Corre el test dentro de una transacción y la deshace siempre (el error propio la revienta al final). */
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

function fieldOf(e: unknown): string {
  expect(e).toBeInstanceOf(DataError)
  return (e as DataError).validationErrors?.[0]?.field ?? ''
}

function messageOf(e: unknown): string {
  return (e as DataError).validationErrors?.[0]?.message ?? (e as Error).message
}

async function catchError(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn()
  } catch (e) {
    return e
  }
  throw new Error('expected the call to throw')
}

function fakeResponse(): { res: Response; buffer: () => Buffer } {
  const chunks: Buffer[] = []
  const stream = new PassThrough()
  stream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)))
  const res = Object.assign(stream, { setHeader: jest.fn() })
  return { res: res as unknown as Response, buffer: () => Buffer.concat(chunks) }
}

async function sheetRows(buffer: Buffer, sheet: string): Promise<unknown[][]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.getWorksheet(sheet)
  if (!ws) throw new Error(`sheet ${sheet} not found; sheets: ${wb.worksheets.map((w) => w.name).join(', ')}`)
  const rows: unknown[][] = []
  ws.eachRow((row) => rows.push((row.values as unknown[]).slice(1)))
  return rows
}

describeIf('Expenses — integración contra la copia local (transacción que se deshace)', () => {
  let moduleRef: TestingModule
  let db: DataSource
  let facade: ExpenseFacadeService
  let reportService: ExpenseReportService
  let report: ExpenseReportRepository
  let catalog: ExpenseCatalogService
  let recurring: RecurringExpenseFacadeService

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
        SrsExpensesModule,
        SrsGenericDataModule,
        SrsExpenseModule,
        ExpenseGroupModule,
        SrsExpenseRepetitiveModule,
        SrsExpenseDealerAssignModule,
        SrsLogGenericModule,
        SrsLogChangeModule,
      ],
    })
      // Los permisos (ROL_ACCION) se prueban aparte; acá se prueban empresa, alcance de dealers y plata.
      .overrideProvider(SrsPermissionRepository)
      .useValue({ userHasRolAccion: async () => true, assertRolAccion: async () => undefined })
      .compile()
    db = moduleRef.get(DataSource)
    facade = moduleRef.get(ExpenseFacadeService)
    reportService = moduleRef.get(ExpenseReportService)
    report = moduleRef.get(ExpenseReportRepository)
    catalog = moduleRef.get(ExpenseCatalogService)
    recurring = moduleRef.get(RecurringExpenseFacadeService)
  }, 60000)

  afterAll(async () => {
    await moduleRef?.close()
  })

  const single = (patch: Record<string, unknown> = {}) => ({
    ticketDate: TICKET_DATE,
    idCompany: COMPANY_1,
    idCategory: CATEGORY_1,
    mode: 'single' as const,
    idDealer: DEALER_A,
    totalAmount: '125.50',
    description: 'Rollos',
    receiptNumber: 'A-1',
    ...patch,
  })

  const equalGroup = (patch: Record<string, unknown> = {}) => ({
    ticketDate: TICKET_DATE,
    idCompany: COMPANY_1,
    idCategory: CATEGORY_1,
    mode: 'equal' as const,
    totalAmount: '100.00',
    branches: [{ idDealer: DEALER_A }, { idDealer: DEALER_B }, { idDealer: DEALER_C }],
    ...patch,
  })

  it('crea un gasto suelto: una fila con todo, log tipo 7 y la última categoría de la compañía (D4)', () =>
    inRollback(async () => {
      const detail = (await facade.create(admin, single())) as ExpenseSingleRow
      expect(detail.kind).toBe('single')
      expect(detail.amount).toBe('125.50')
      expect(detail.status).toBe('pending')
      expect(detail.dealer.id).toBe(DEALER_A)
      const rows = await db.query('SELECT id_detailer, notes, description, receipt_number, id_exp_group, estado FROM EXP_EXPENSE WHERE id = ?', [detail.id])
      expect(rows[0]).toMatchObject({ id_detailer: PROVIDER, notes: '', description: 'Rollos', receipt_number: 'A-1', id_exp_group: null, estado: 1 })
      const logs = await db.query('SELECT description, tipo FROM LOG_GENERIC WHERE id_expense = ?', [detail.id])
      expect(logs).toEqual([{ description: 'Expense created ($125.50)', tipo: 7 }])
      // Un gasto suelto no lleva dealer en el log: es el del gasto.
      expect((await facade.log(admin, detail.id)).data[0].dealer).toBeNull()
      const company = await db.query('SELECT id_parent FROM GENERIC_DATA WHERE id = ?', [COMPANY_1])
      expect(Number(company[0].id_parent)).toBe(CATEGORY_1)
      // La última categoría cambia con cada gasto.
      await facade.create(admin, single({ idCategory: CATEGORY_2 }))
      const again = await db.query('SELECT id_parent FROM GENERIC_DATA WHERE id = ?', [COMPANY_1])
      expect(Number(again[0].id_parent)).toBe(CATEGORY_2)
    }))

  it('crea un grupo Equal: N filas, suma = total, id_exp_group, id_attachment_expense = menor id, created_at', () =>
    inRollback(async () => {
      const group = (await facade.create(admin, equalGroup())) as ExpenseGroupRow
      expect(group.kind).toBe('group')
      expect(group.splitType).toBe('equal')
      expect(group.rows).toHaveLength(3)
      expect(group.visibleTotal).toBe('100.00')
      expect(group.visibleRows).toBe(3)
      expect(group.totalRows).toBe(3)
      expect(group.readOnly).toBe(false)
      expect(group.rows.map((r) => r.amount).sort()).toEqual(['33.33', '33.33', '33.34'])
      const rows = await db.query('SELECT id, amount FROM EXP_EXPENSE WHERE id_exp_group = ? ORDER BY id', [group.groupId])
      expect(rows).toHaveLength(3)
      const sum = rows.reduce((a: number, r: { amount: string }) => a + Math.round(Number(r.amount) * 100), 0)
      expect(sum).toBe(10000)
      const g = await db.query('SELECT id_attachment_expense, created_at, deleted_at, split_type FROM EXP_EXPENSE_GROUP WHERE id = ?', [group.groupId])
      expect(Number(g[0].id_attachment_expense)).toBe(Number(rows[0].id))
      expect(g[0].created_at).toBeTruthy()
      expect(g[0].deleted_at).toBeNull()
      expect(Number(g[0].split_type)).toBe(1)
      const glog = await db.query('SELECT description, tipo FROM LOG_GENERIC WHERE id_exp_group = ?', [group.groupId])
      expect(glog).toEqual([{ description: 'Group created (3 dealers, Equal)', tipo: 7 }])
    }))

  it('crea grupos By percentage y By amount con la regla del cron', () =>
    inRollback(async () => {
      const percent = (await facade.create(admin, {
        ...equalGroup(),
        mode: 'percent',
        totalAmount: '1000.00',
        branches: [
          { idDealer: DEALER_A, percentage: '60' },
          { idDealer: DEALER_B, percentage: '40' },
        ],
      })) as ExpenseGroupRow
      // las filas vuelven por id de fila (orden de alta); se compara sin depender del orden
      expect(percent.rows.map((r) => [r.dealer.id, r.amount]).sort((a, b) => Number(a[0]) - Number(b[0]))).toEqual(
        [
          [DEALER_A, '600.00'],
          [DEALER_B, '400.00'],
        ].sort((a, b) => Number(a[0]) - Number(b[0])),
      )
      const amount = (await facade.create(admin, {
        ...equalGroup(),
        mode: 'amount',
        totalAmount: undefined,
        branches: [
          { idDealer: DEALER_A, amount: '10.00' },
          { idDealer: DEALER_B, amount: '0.01' },
        ],
      })) as ExpenseGroupRow
      expect(amount.visibleTotal).toBe('10.01')
      expect(amount.splitType).toBe('amount')
    }))

  it('rechaza en su campo: porcentajes que no suman 100, dealer de otra empresa, dealer fuera del alcance, empleado ajeno', () =>
    inRollback(async () => {
      const sum = await catchError(() =>
        facade.create(admin, {
          ...equalGroup(),
          mode: 'percent',
          branches: [
            { idDealer: DEALER_A, percentage: '50' },
            { idDealer: DEALER_B, percentage: '49.99' },
          ],
        }),
      )
      expect(fieldOf(sum)).toBe('branches')
      expect(messageOf(sum)).toBe(msgPercentsSum('99.99'))

      const foreign = await catchError(() => facade.create(admin, equalGroup({ branches: [{ idDealer: DEALER_A }, { idDealer: OTHER_DEALER }] })))
      expect(fieldOf(foreign)).toBe('branches.1.idDealer')
      expect(messageOf(foreign)).toBe(MSG_BRANCH_OUT_OF_SCOPE)

      const outOfScope = await catchError(() => facade.create(restricted, single({ idDealer: DEALER_B })))
      expect(fieldOf(outOfScope)).toBe('idDealer')

      const employee = await catchError(() => facade.create(admin, single({ idAuthor: 999999 })))
      expect(fieldOf(employee)).toBe('idAuthor')

      const ok = (await facade.create(admin, single({ idAuthor: EMPLOYEE_ON_A }))) as ExpenseSingleRow
      expect(ok.author.id).toBe(EMPLOYEE_ON_A)

      const futureDate = await catchError(() => facade.create(admin, single({ ticketDate: '2099-01-01' })))
      expect(fieldOf(futureDate)).toBe('ticketDate')

      const otherCompanyCategory = await catchError(() => facade.create(admin, single({ idCompany: 729 })))
      expect(fieldOf(otherCompanyCategory)).toBe('idCompany')
    }))

  it('un id de otra empresa da 404 en lectura', () =>
    inRollback(async () => {
      const created = (await facade.create(admin, single())) as ExpenseSingleRow
      await expect(facade.get(otherCompany, created.id)).rejects.toBeInstanceOf(NotFoundException)
      await expect(facade.update(otherCompany, created.id, { ...single(), kind: 'single' })).rejects.toBeInstanceOf(NotFoundException)
    }))

  it('grupo visto parcialmente (D8): visibleRows < totalRows, readOnly, y toda escritura da 403', () =>
    inRollback(async () => {
      const group = (await facade.create(admin, equalGroup({ branches: [{ idDealer: DEALER_A }, { idDealer: DEALER_B }] }))) as ExpenseGroupRow
      const rowA = group.rows.find((r) => r.dealer.id === DEALER_A)!
      const rowB = group.rows.find((r) => r.dealer.id === DEALER_B)!
      const seen = (await facade.get(restricted, rowA.id)) as ExpenseGroupRow
      expect(seen.kind).toBe('group')
      expect(seen.visibleRows).toBe(1)
      expect(seen.totalRows).toBe(2)
      expect(seen.readOnly).toBe(true)
      expect(seen.visibleTotal).toBe(rowA.amount)
      await expect(facade.get(restricted, rowB.id)).resolves.toMatchObject({ kind: 'group', visibleRows: 1 })

      const writes: (() => Promise<unknown>)[] = [
        () => facade.update(restricted, rowA.id, { ...single(), kind: 'single' }),
        () => facade.update(restricted, group.groupId, { ...equalGroup(), kind: 'group' }),
        () => facade.setApproval(restricted, rowA.id, { approved: true }),
        () => facade.setGroupApproval(restricted, group.groupId, { approved: true }),
        () => facade.remove(restricted, rowA.id),
        () => facade.removeGroup(restricted, group.groupId),
        () => facade.restore(restricted, rowA.id),
      ]
      for (const w of writes) {
        const e = await catchError(w)
        expect(e).toBeInstanceOf(ForbiddenException)
        expect((e as Error).message).toBe(MSG_SOME_BRANCHES_OUTSIDE)
      }
      // El log sí se ve.
      const log = await facade.log(restricted, rowA.id)
      expect(log.data.some((l) => l.scope === 'group')).toBe(true)
      // Sin las líneas ni el nombre de los dealers fuera de su alcance.
      const nameOf = async (id: number) => (await db.query('SELECT razon_social FROM CONTRATISTA WHERE id = ?', [id]))[0].razon_social
      const dealers = log.data.map((l) => l.dealer)
      expect(dealers).toContain(await nameOf(DEALER_A))
      expect(dealers).not.toContain(await nameOf(DEALER_B))
      expect((await facade.log(admin, rowA.id)).data.map((l) => l.dealer)).toContain(await nameOf(DEALER_B))
    }))

  it('estado mixto «k of n approved» y approve de grupo que respeta las ya decididas', () =>
    inRollback(async () => {
      const group = (await facade.create(admin, equalGroup())) as ExpenseGroupRow
      const [r1, r2] = group.rows
      await facade.setApproval(admin, r1.id, { approved: true })
      await facade.setApproval(admin, r2.id, { approved: false })
      const mixed = (await facade.get(admin, r1.id)) as ExpenseGroupRow
      expect(mixed.status).toBe('pending')
      expect(mixed.approvedCount).toBe(1)
      expect(mixed.rejectedCount).toBe(1)
      const before = await db.query('SELECT approved_date, is_approved FROM EXP_EXPENSE WHERE id IN (?, ?) ORDER BY id', [r1.id, r2.id])
      const after = (await facade.setGroupApproval(admin, group.groupId, { approved: true })) as ExpenseGroupRow
      expect(after.approvedCount).toBe(2)
      expect(after.status).toBe('pending') // la rechazada sigue rechazada
      const stamps = await db.query('SELECT approved_date, is_approved FROM EXP_EXPENSE WHERE id IN (?, ?) ORDER BY id', [r1.id, r2.id])
      expect(stamps).toEqual(before)
      const logs = await db.query('SELECT description FROM LOG_GENERIC WHERE id_expense = ? ORDER BY id', [r1.id])
      expect(logs.map((l: { description: string }) => l.description)).toEqual([expect.stringMatching(/^Expense created \(\$\d+\.\d{2}\)$/), 'Receipt approved'])
    }))

  it('editar un grupo con una fila aprobada: 409 solo si el reparto cambia de verdad; notes/description/receipt se aplican a todas', () =>
    inRollback(async () => {
      const group = (await facade.create(admin, equalGroup())) as ExpenseGroupRow
      await facade.setApproval(admin, group.rows[0].id, { approved: true })
      // Otro total, otro dealer: cambio de reparto.
      const blocked = await catchError(() => facade.update(admin, group.groupId, { ...equalGroup(), totalAmount: '200.00', kind: 'group' }))
      expect(blocked).toBeInstanceOf(ConflictException)
      const otherDealers = await catchError(() => facade.update(admin, group.groupId, { ...equalGroup({ branches: [{ idDealer: DEALER_A }, { idDealer: DEALER_B }] }), kind: 'group' }))
      expect(otherDealers).toBeInstanceOf(ConflictException)
      // El mismo reparto en el cuerpo (el form entero) no es un cambio.
      const sameSplit = (await facade.update(admin, group.groupId, { ...equalGroup(), notes: 'Nota nueva', kind: 'group' })) as ExpenseGroupRow
      expect(sameSplit.rows.every((r) => r.notes === 'Nota nueva')).toBe(true)
      // El cuerpo de solo textos (sin ticketDate ni mode) también.
      const edited = (await facade.update(admin, group.groupId, { description: 'Otra', receiptNumber: 'B-2', notes: 'Nota 2', kind: 'group' })) as ExpenseGroupRow
      expect(edited.rows.every((r) => r.notes === 'Nota 2' && r.description === 'Otra' && r.receiptNumber === 'B-2')).toBe(true)
      expect(edited.visibleTotal).toBe('100.00')
      // Sin aprobadas, el reparto cambia: entra un dealer, sale otro, la fila que sale queda estado 0.
      const other = (await facade.create(admin, equalGroup({ branches: [{ idDealer: DEALER_A }, { idDealer: DEALER_B }] }))) as ExpenseGroupRow
      const changed = (await facade.update(admin, other.groupId, {
        ...equalGroup(),
        kind: 'group',
        totalAmount: '50.00',
        branches: [{ idDealer: DEALER_A }, { idDealer: DEALER_C }],
      })) as ExpenseGroupRow
      expect(changed.rows.map((r) => r.dealer.id).sort((a, b) => a - b)).toEqual([DEALER_C, DEALER_A].sort((a, b) => a - b))
      expect(changed.visibleTotal).toBe('50.00')
      const gone = await db.query('SELECT estado FROM EXP_EXPENSE WHERE id_exp_group = ? AND id_dealer = ?', [other.groupId, DEALER_B])
      expect(Number(gone[0].estado)).toBe(EXPENSE_ESTADO_RETIRED)
      // El log del grupo trae las filas de todos los dealers, también la que salió, con su nombre e importe.
      const names = await db.query('SELECT id, razon_social FROM CONTRATISTA WHERE id = ?', [DEALER_B])
      const log = await facade.log(admin, changed.rows[0].id)
      expect(log.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ description: 'Dealer removed ($50.00)', dealer: names[0].razon_social, scope: 'expense' }),
          expect.objectContaining({ description: 'Expense created ($50.00)', dealer: names[0].razon_social }),
          // El dealer que entra en una edición no se «crea»: se agrega.
          expect.objectContaining({ description: 'Dealer added ($25.00)', dealer: (await db.query('SELECT razon_social FROM CONTRATISTA WHERE id = ?', [DEALER_C]))[0].razon_social }),
        ]),
      )
      expect(log.data.find((l) => l.description.startsWith('Split changed'))?.dealer).toBeNull()
    }))

  it('borrar un grupo marca deleted_at y restaurar una fila lo reabre, con log por fila (tipo 7)', () =>
    inRollback(async () => {
      const group = (await facade.create(admin, equalGroup())) as ExpenseGroupRow
      await facade.removeGroup(admin, group.groupId)
      const g = await db.query('SELECT deleted_at FROM EXP_EXPENSE_GROUP WHERE id = ?', [group.groupId])
      expect(g[0].deleted_at).not.toBeNull()
      const rows = await db.query('SELECT estado, id_author_del FROM EXP_EXPENSE WHERE id_exp_group = ?', [group.groupId])
      expect(rows.every((r: { estado: number; id_author_del: number }) => Number(r.estado) === 0 && Number(r.id_author_del) === ADMIN_USER)).toBe(true)
      const restored = (await facade.restore(admin, group.rows[0].id)) as ExpenseGroupRow
      expect(restored.kind).toBe('group')
      expect(restored.deleted).toBe(false)
      const g2 = await db.query('SELECT deleted_at FROM EXP_EXPENSE_GROUP WHERE id = ?', [group.groupId])
      expect(g2[0].deleted_at).toBeNull()
      const log = await facade.log(admin, group.rows[0].id)
      const texts = log.data.map((l) => l.description)
      expect(texts).toEqual(expect.arrayContaining(['Receipt activated', 'Receipt deleted', `Expense created ($${group.rows[0].amount})`, 'Group deleted (3 dealers)']))
      const tipos = await db.query('SELECT DISTINCT tipo FROM LOG_GENERIC WHERE id_expense = ? OR id_exp_group = ?', [group.rows[0].id, group.groupId])
      expect(tipos).toEqual([{ tipo: 7 }])
    }))

  it('PUT con el mismo idAuthor no valida nada; otro idAuthor sí (empleado asignado a la Branch)', () =>
    inRollback(async () => {
      const created = (await facade.create(admin, single())) as ExpenseSingleRow
      expect(created.author.id).toBe(ADMIN_USER)
      // El mismo autor que tiene el gasto, aunque no sea un empleado asignado: se conserva sin validar.
      const same = (await facade.update(admin, created.id, { ...single(), idAuthor: ADMIN_USER, notes: 'x', kind: 'single' })) as ExpenseSingleRow
      expect(same.author.id).toBe(ADMIN_USER)
      const kept = (await facade.update(admin, created.id, { ...single(), kind: 'single' })) as ExpenseSingleRow
      expect(kept.author.id).toBe(ADMIN_USER)
      const bad = await catchError(() => facade.update(admin, created.id, { ...single(), idAuthor: 999999, kind: 'single' }))
      expect(fieldOf(bad)).toBe('idAuthor')
      const changed = (await facade.update(admin, created.id, { ...single(), idAuthor: EMPLOYEE_ON_A, kind: 'single' })) as ExpenseSingleRow
      expect(changed.author.id).toBe(EMPLOYEE_ON_A)
      const logs = await db.query('SELECT description FROM LOG_GENERIC WHERE id_expense = ? ORDER BY id', [created.id])
      expect(logs.map((l: { description: string }) => l.description).filter((d: string) => d.startsWith('Assigned to:'))).toHaveLength(1)
    }))

  it('attachment-log: «Attachment {filename}» con id_expense (y id_exp_group en la fila del adjunto); hasAttachment sale de ahí', () =>
    inRollback(async () => {
      const group = (await facade.create(admin, equalGroup())) as ExpenseGroupRow
      const attachmentId = group.attachmentExpenseId as number
      const otherId = group.rows.find((r) => r.id !== attachmentId)!.id
      await facade.logAttachment(admin, attachmentId, { filename: 'receipt.jpg' })
      await facade.logAttachment(admin, otherId, { filename: 'other.pdf' })
      const rows = await db.query(
        'SELECT id_expense, id_exp_group, tipo, description FROM LOG_GENERIC WHERE id_expense IN (?, ?) AND description LIKE ? ORDER BY id',
        [attachmentId, otherId, 'Attachment %'],
      )
      expect(rows).toEqual([
        { id_expense: attachmentId, id_exp_group: group.groupId, tipo: 7, description: 'Attachment receipt.jpg' },
        { id_expense: otherId, id_exp_group: null, tipo: 7, description: 'Attachment other.pdf' },
      ])
      const detail = (await facade.get(admin, attachmentId)) as ExpenseGroupRow
      expect(detail.hasAttachment).toBe(true)
      expect(detail.rows.every((r) => r.hasAttachment)).toBe(true)
      const log = await facade.log(admin, attachmentId)
      expect(log.data.some((l) => l.description === 'Attachment receipt.jpg' && l.scope === 'group')).toBe(true)
      // Con adjunto, la Branch de esa fila no sale del grupo al cambiar el reparto.
      const attachmentDealer = group.rows.find((r) => r.id === attachmentId)!.dealer.id
      const others = [DEALER_A, DEALER_B, DEALER_C].filter((d) => d !== attachmentDealer)
      const locked = await catchError(() => facade.update(admin, group.groupId, { ...equalGroup({ branches: others.map((idDealer) => ({ idDealer })) }), kind: 'group' }))
      expect(fieldOf(locked)).toBe('branches')
      await expect(facade.logAttachment(otherCompany, attachmentId, { filename: 'x.jpg' })).rejects.toBeInstanceOf(NotFoundException)
      // Un gasto suelto: hasAttachment en la fila.
      const singleRow = (await facade.create(admin, single())) as ExpenseSingleRow
      await facade.logAttachment(admin, singleRow.id, { filename: 'a.png' })
      expect(((await facade.get(admin, singleRow.id)) as ExpenseSingleRow).hasAttachment).toBe(true)
    }))

  it('restore de grupo: todas las filas borradas vuelven sin quién ni cuándo, el grupo se reabre, log por fila y por grupo; visto parcialmente → 403', () =>
    inRollback(async () => {
      const group = (await facade.create(admin, equalGroup())) as ExpenseGroupRow
      await facade.removeGroup(admin, group.groupId)
      await expect(facade.restoreGroup(restricted, group.groupId)).rejects.toBeInstanceOf(ForbiddenException)
      const restored = (await facade.restoreGroup(admin, group.groupId)) as ExpenseGroupRow
      expect(restored.kind).toBe('group')
      expect(restored.deleted).toBe(false)
      expect(restored.visibleRows).toBe(3)
      const rows = await db.query('SELECT estado, id_author_del, deleted_date FROM EXP_EXPENSE WHERE id_exp_group = ?', [group.groupId])
      expect(rows).toHaveLength(3)
      expect(rows.every((r: { estado: number; id_author_del: unknown; deleted_date: unknown }) => Number(r.estado) === 1 && r.id_author_del === null && r.deleted_date === null)).toBe(true)
      const g = await db.query('SELECT deleted_at FROM EXP_EXPENSE_GROUP WHERE id = ?', [group.groupId])
      expect(g[0].deleted_at).toBeNull()
      const perRow = await db.query('SELECT COUNT(*) AS c FROM LOG_GENERIC WHERE id_expense IN (?, ?, ?) AND description = ?', [
        ...group.rows.map((r) => r.id),
        'Group restored (3 dealers)',
      ])
      expect(Number(perRow[0].c)).toBe(3)
      const perGroup = await db.query('SELECT COUNT(*) AS c FROM LOG_GENERIC WHERE id_exp_group = ? AND id_expense IS NULL AND description = ?', [group.groupId, 'Group restored (3 dealers)'])
      expect(Number(perGroup[0].c)).toBe(1)
      // Ya restaurado: devuelve el grupo como está, sin escribir.
      const again = (await facade.restoreGroup(admin, group.groupId)) as ExpenseGroupRow
      expect(again.visibleRows).toBe(3)
      await expect(facade.restoreGroup(otherCompany, group.groupId)).rejects.toBeInstanceOf(NotFoundException)
    }))

  it('restore de grupo: un dealer que salió del reparto no vuelve, ni por grupo ni por fila, y el total queda igual', () =>
    inRollback(async () => {
      const group = (await facade.create(admin, {
        ...equalGroup({ branches: [{ idDealer: DEALER_A }, { idDealer: DEALER_B }] }),
      })) as ExpenseGroupRow
      const rowA = group.rows.find((r) => r.dealer.id === DEALER_A)!.id
      const edited = (await facade.update(admin, group.groupId, {
        ...equalGroup({ branches: [{ idDealer: DEALER_B }, { idDealer: DEALER_C }] }),
        kind: 'group',
      })) as ExpenseGroupRow
      expect(edited.rows.map((r) => r.dealer.id).sort()).toEqual([DEALER_B, DEALER_C].sort())
      // La fila reemplazada ya no se ve ni se puede restaurar sola.
      await expect(facade.get(admin, rowA)).rejects.toBeInstanceOf(NotFoundException)
      await expect(facade.restore(admin, rowA)).rejects.toBeInstanceOf(NotFoundException)
      await facade.removeGroup(admin, group.groupId)
      const restored = (await facade.restoreGroup(admin, group.groupId)) as ExpenseGroupRow
      expect(restored.rows.map((r) => r.dealer.id).sort()).toEqual([DEALER_B, DEALER_C].sort())
      expect(restored.visibleTotal).toBe('100.00')
      const active = await db.query('SELECT SUM(amount) AS s FROM EXP_EXPENSE WHERE id_exp_group = ? AND estado = 1', [group.groupId])
      expect(Number(active[0].s)).toBe(100)
    }))

  it('restore de grupo: un dealer sacado y vuelto a agregar no queda dos veces; una fila borrada antes de borrar el grupo no vuelve', () =>
    inRollback(async () => {
      const group = (await facade.create(admin, equalGroup())) as ExpenseGroupRow
      const twoDealers = equalGroup({ branches: [{ idDealer: DEALER_A }, { idDealer: DEALER_B }] })
      await facade.update(admin, group.groupId, { ...twoDealers, kind: 'group' })
      await facade.update(admin, group.groupId, { ...equalGroup(), kind: 'group' })
      await facade.removeGroup(admin, group.groupId)
      const restored = (await facade.restoreGroup(admin, group.groupId)) as ExpenseGroupRow
      expect(restored.rows).toHaveLength(3)
      expect(restored.visibleTotal).toBe('100.00')

      const other = (await facade.create(admin, equalGroup())) as ExpenseGroupRow
      await facade.remove(admin, other.rows[0].id)
      await facade.removeGroup(admin, other.groupId)
      const back = (await facade.restoreGroup(admin, other.groupId)) as ExpenseGroupRow
      expect(back.rows).toHaveLength(2)
    }))

  it('editar un grupo por porcentaje sin tocar el reparto: lo precargado suma 100 y los montos no cambian', () =>
    inRollback(async () => {
      const group = (await facade.create(admin, {
        ...equalGroup({
          mode: 'percent',
          totalAmount: '100.01',
          branches: [
            { idDealer: DEALER_A, percentage: '33.33' },
            { idDealer: DEALER_B, percentage: '33.33' },
            { idDealer: DEALER_C, percentage: '33.34' },
          ],
        }),
      })) as ExpenseGroupRow
      const detail = (await facade.get(admin, group.rows[0].id)) as ExpenseGroupRow
      const cents = detail.rows.reduce((acc, r) => acc + Math.round(Number(r.percentage) * 100), 0)
      expect(cents).toBe(10000)
      const before = new Map(detail.rows.map((r) => [r.dealer.id, r.amount]))
      const saved = (await facade.update(admin, group.groupId, {
        ...equalGroup({
          mode: 'percent',
          totalAmount: '100.01',
          notes: 'solo notas',
          branches: detail.rows.map((r) => ({ idDealer: r.dealer.id, percentage: r.percentage as string })),
        }),
        kind: 'group',
      })) as ExpenseGroupRow
      expect(new Map(saved.rows.map((r) => [r.dealer.id, r.amount]))).toEqual(before)
    }))

  it('adjunto: se autoriza antes de subir; fuera del alcance o borrado no se puede', () =>
    inRollback(async () => {
      const group = (await facade.create(admin, equalGroup())) as ExpenseGroupRow
      await expect(facade.assertCanAttach(admin, group.rows[0].id)).resolves.toBeDefined()
      await expect(facade.assertCanAttach(restricted, group.rows[0].id)).rejects.toBeInstanceOf(ForbiddenException)
      await expect(facade.assertCanAttach(otherCompany, group.rows[0].id)).rejects.toBeInstanceOf(NotFoundException)
      await facade.removeGroup(admin, group.groupId)
      await expect(facade.assertCanAttach(admin, group.rows[0].id)).rejects.toBeInstanceOf(NotFoundException)
    }))

  it('Report Info: el nombre de un usuario de otra empresa no se publica', () =>
    inRollback(async () => {
      const foreign = await db.query(
        'SELECT u.id_usuario AS id FROM usuarios u WHERE u.id_contratista_owner IS NOT NULL AND u.id_contratista_owner <> ? AND NOT EXISTS (SELECT 1 FROM EXP_EXPENSE e WHERE e.id_detailer = ? AND (e.id_author = u.id_usuario OR e.id_created_by = u.id_usuario)) LIMIT 1',
        [admin.idDealerProvider, admin.idDealerProvider],
      )
      const own = await facade.create(admin, single())
      const names = await report.userNames(admin.idDealerProvider, [Number(foreign[0].id), (own as ExpenseSingleRow).author.id])
      expect(names.has(Number(foreign[0].id))).toBe(false)
      expect(names.has((own as ExpenseSingleRow).author.id)).toBe(true)
    }))

  it('crear una compañía al vuelo dos veces con el mismo nombre deja una sola fila', () =>
    inRollback(async () => {
      const name = `Prueba Pro ${Date.now()}`
      const first = await catalog.create(admin, 'company', { name })
      const second = await catalog.create(admin, 'company', { name: `  ${name.toUpperCase()} ` })
      expect(first.existing).toBe(false)
      expect(second.existing).toBe(true)
      expect(second.id).toBe(first.id)
      const rows = await db.query('SELECT COUNT(*) AS c FROM GENERIC_DATA WHERE id_categoria = 34 AND id_dealer_provider = ? AND LOWER(TRIM(name)) = LOWER(?)', [PROVIDER, name])
      expect(Number(rows[0].c)).toBe(1)
      const dup = await catchError(() => catalog.update(admin, 'company', first.id, { name: 'The Home Depot' }))
      expect(fieldOf(dup)).toBe('name')
      await expect(catalog.update(otherCompany, 'company', first.id, { name: 'x' })).rejects.toBeInstanceOf(NotFoundException)
    }))

  it('summary, lista, Analytics y amountsByDealer dan el mismo total; «Expenses» cuenta gastos, no filas', () =>
    inRollback(async () => {
      const query = { from: TICKET_DATE, to: TICKET_DATE, idDealer: `${DEALER_A},${DEALER_B},${DEALER_C}` }
      const before = await reportService.summary(admin, query)
      await facade.create(admin, single())
      await facade.create(admin, equalGroup())
      const after = await reportService.summary(admin, query)
      expect(after.count - before.count).toBe(2)
      expect(Math.round((Number(after.total) - Number(before.total)) * 100)).toBe(22550)
      const list = await reportService.list(admin, { ...query, pageSize: 50 })
      expect(list.data.some((r) => r.kind === 'group')).toBe(true)
      const analytics = await reportService.analytics(admin, { ...query, groupBy: 'category' })
      expect(analytics.total).toBe(after.total)
      const byDealer = await report.amountsByDealer(buildExpenseListFilter(admin, query))
      const sum = byDealer.reduce((a, r) => a + Math.round(Number(r.total) * 100), 0)
      expect(sum).toBe(Math.round(Number(after.total) * 100))
      // Usuario con dealers: ve el grupo como (1 of 3) y solo lectura; el total es lo que ve.
      const restrictedList = await reportService.list(restricted, { ...query, idDealer: String(DEALER_A), pageSize: 50 })
      const partial = restrictedList.data.find((r) => r.kind === 'group') as ExpenseGroupRow | undefined
      expect(partial).toBeDefined()
      expect(partial!.visibleRows).toBe(1)
      expect(partial!.totalRows).toBe(3)
      expect(partial!.readOnly).toBe(true)
      await expect(reportService.list(admin, { ...query, idDealer: '' })).rejects.toThrow('Select at least one dealer')
      const employees = await reportService.employees(admin, { idDealer: String(OTHER_DEALER) })
      expect(employees.results).toEqual([])
    }))

  it('export de la lista: Report Info + Expenses, una fila por EXP_EXPENSE', () =>
    inRollback(async () => {
      await facade.create(admin, equalGroup())
      const { res, buffer } = fakeResponse()
      await reportService.exportList(admin, { from: TICKET_DATE, to: TICKET_DATE, idDealer: `${DEALER_A},${DEALER_B},${DEALER_C}` }, res)
      const info = await sheetRows(buffer(), 'Report Info')
      expect(info[0]).toEqual(['Field', 'Value'])
      expect(info.some((r) => r[0] === 'Screen' && r[1] === 'Expenses › Expenses List')).toBe(true)
      const data = await sheetRows(buffer(), 'Expenses')
      expect(data[1]).toEqual(['Date', 'Company', 'Category', 'Dealer', 'Amount', 'Assigned to', 'Created by', 'Status', 'Description', 'Receipt #', 'Notes'])
      expect(data.length - 2).toBeGreaterThanOrEqual(3)
    }))

  it('regla recurrente: alta con start/end, add dealers (uno ajeno → 400), editAssign, Don\'t block changes, split y export', () =>
    inRollback(async () => {
      const rule = await recurring.create(admin, {
        description: 'Prueba Pro',
        idCompany: COMPANY_1,
        idCategory: CATEGORY_1,
        amount: '1000.00',
        splitType: 'percent',
        frequency: 'monthly',
        startDate: '2026-11-01',
        endDate: '2027-01-31',
      })
      expect(rule.startDate).toBe('2026-11-01')
      expect(rule.endDate).toBe('2027-01-31')
      expect(rule.assigns).toEqual([])
      const logs = await db.query('SELECT desc_cambio, origen FROM LOG_CHANGE WHERE id_exp_repetitive = ?', [rule.id])
      expect(logs).toEqual([{ desc_cambio: `Recurring expense ${rule.id} created`, origen: 'pro' }])

      const foreign = await catchError(() => recurring.addDealers(admin, rule.id, { idDealers: [DEALER_A, OTHER_DEALER] }))
      expect(fieldOf(foreign)).toBe('idDealers')
      // Usuario con restricción: un dealer de la empresa fuera de su alcance tampoco entra.
      const outOfScope = await catchError(() => recurring.addDealers(restricted, rule.id, { idDealers: [DEALER_B] }))
      expect(fieldOf(outOfScope)).toBe('idDealers')
      expect(messageOf(outOfScope)).toBe(MSG_BRANCH_OUT_OF_SCOPE)
      expect((await recurring.get(admin, rule.id)).assigns).toEqual([])

      let detail = await recurring.addDealers(admin, rule.id, { idDealers: [DEALER_A, DEALER_B] })
      expect(detail.assigns.map((a) => [a.automatic, a.percentage])).toEqual([
        [true, '50.00'],
        [true, '50.00'],
      ])
      expect(detail.totalPercent).toBe('100.00')
      expect(detail.canRun).toBeNull()
      const [a1, a2] = detail.assigns

      detail = await recurring.editAssign(admin, rule.id, a1.id, { automatic: false, percentage: '60' })
      expect(detail.assigns.map((a) => a.percentage)).toEqual(['60.00', '40.00'])

      const over = await catchError(() => recurring.editAssign(admin, rule.id, a2.id, { automatic: false, percentage: '50' }))
      expect(fieldOf(over)).toBe('percentage')
      expect(messageOf(over)).toBe(msgSumOver100('110.00'))

      detail = await recurring.editAssign(admin, rule.id, a2.id, { automatic: false, percentage: '50', allowAnyTotal: true })
      expect(detail.totalPercent).toBe('110.00')
      expect(detail.canRun).toBe('percents add up to 110.00%')

      const needs100 = await catchError(() => recurring.changeSplitType(admin, rule.id, { splitType: 'fixed' }))
      expect(fieldOf(needs100)).toBe('splitType')

      // Export con la regla salteada: Amount vacío y la línea en Report Info.
      const skipped = fakeResponse()
      await recurring.exportDealers(admin, rule.id, skipped.res)
      const infoSkipped = await sheetRows(skipped.buffer(), 'Report Info')
      expect(infoSkipped.some((r) => r[0] === 'Amounts not shown' && r[1] === 'percents add up to 110.00%')).toBe(true)
      const dealersSkipped = await sheetRows(skipped.buffer(), 'Dealers')
      expect(dealersSkipped[1]).toEqual(['Dealer ID', 'Dealer', 'Mode', 'Percent', 'Amount'])
      expect(dealersSkipped[2][4] ?? null).toBeNull()

      detail = await recurring.editAssign(admin, rule.id, a2.id, { automatic: true })
      expect(detail.assigns.map((a) => a.percentage)).toEqual(['60.00', '40.00'])

      const ok = fakeResponse()
      await recurring.exportDealers(admin, rule.id, ok.res)
      const dealers = await sheetRows(ok.buffer(), 'Dealers')
      expect(dealers.slice(2).map((r) => [r[0], r[2], r[3], r[4]])).toEqual([
        [DEALER_A, 'Manual', 60, 600],
        [DEALER_B, 'Automatic', 40, 400],
      ])

      detail = await recurring.changeSplitType(admin, rule.id, { splitType: 'fixed' })
      expect(detail.splitType).toBe('fixed')
      expect(detail.assigns.map((a) => a.fixedAmount)).toEqual(['600.00', '400.00'])
      expect(detail.amount).toBe('1000.00')
      detail = await recurring.editAssign(admin, rule.id, a1.id, { fixedAmount: '700' })
      expect(detail.amount).toBe('1100.00')
      detail = await recurring.removeAssign(admin, rule.id, a2.id, false)
      expect(detail.assigns).toHaveLength(1)
      expect(detail.amount).toBe('700.00')
      detail = await recurring.changeSplitType(admin, rule.id, { splitType: 'percent' })
      expect(detail.assigns[0]).toMatchObject({ automatic: true, percentage: '100.00', fixedAmount: null })

      // Automatic grabados con el redondeo viejo del legacy (Insurance: 15 × 6.67 = 100.05 %): se usan recalculados,
      // así que la regla corre, el detalle los muestra sumando 100 y el cambio a By fixed amount no queda bloqueado.
      detail = await recurring.addDealers(admin, rule.id, { idDealers: [DEALER_B] })
      await db.query('UPDATE EXP_EXPENSE_DEALER_ASSIGN SET percentage = 50.03 WHERE id_exp_repetitive = ?', [rule.id])
      detail = await recurring.get(admin, rule.id)
      expect(detail.canRun).toBeNull()
      expect(detail.assigns.map((a) => a.percentage)).toEqual(['50.00', '50.00'])
      expect(detail.totalPercent).toBe('100.00')
      detail = await recurring.changeSplitType(admin, rule.id, { splitType: 'fixed' })
      expect(detail.assigns.map((a) => a.fixedAmount)).toEqual(['350.00', '350.00'])
      expect(detail.amount).toBe('700.00')

      await expect(recurring.get(otherCompany, rule.id)).rejects.toBeInstanceOf(NotFoundException)
      await recurring.remove(admin, rule.id)
      const status = await db.query('SELECT status, id_author_delete FROM EXP_EXPENSE_REPETITIVE WHERE id = ?', [rule.id])
      expect(Number(status[0].status)).toBe(0)
      expect(Number(status[0].id_author_delete)).toBe(ADMIN_USER)
    }))

  it('Add Expense precargado desde una regla queda vinculado (id_exp_repetitive) y una regla ajena da 400', () =>
    inRollback(async () => {
      const rule = await recurring.create(admin, {
        description: 'Prueba vinculada',
        idCompany: COMPANY_1,
        idCategory: CATEGORY_1,
        amount: '100.00',
        splitType: 'percent',
        frequency: 'monthly',
        startDate: '2026-11-01',
      })
      const group = (await facade.create(admin, equalGroup({ idExpRepetitive: rule.id }))) as ExpenseGroupRow
      expect(group.idExpRepetitive).toBe(rule.id)
      const bad = await catchError(() => facade.create(otherCompany, { ...single({ idCompany: 729, idCategory: 729, idDealer: OTHER_DEALER }), idExpRepetitive: rule.id }))
      expect(fieldOf(bad)).toBe('idCategory')
    }))
})
