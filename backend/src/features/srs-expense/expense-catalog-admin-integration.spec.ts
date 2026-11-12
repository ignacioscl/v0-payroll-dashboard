/**
 * Expenses › Settings: borrar, unificar, ver inactivas y reactivar al dar de alta (plans/plan-expenses-settings,
 * §10). Corre contra la copia local de PROD del 07/11/2026 (`srssui5_srs_20261107` en 127.0.0.1:3307) dentro de una
 * transacción que se deshace al final de cada test: nada queda grabado. Se salta solo, con aviso, si la base no es
 * esa copia.
 */
import 'dotenv/config'
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
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
import { SrsGenericDataModule } from 'src/features/srs-generic-data/srs-generic-data.module'
import { ExpenseCatalogService } from 'src/features/srs-generic-data/service/expense-catalog.service'
import { GenericDataService } from 'src/features/srs-generic-data/service/generic-data.service'
import { ExpenseGroupModule } from 'src/features/expense-group/expense-group.module'
import { SrsExpenseRepetitiveModule } from 'src/features/srs-expense-repetitive/srs-expense-repetitive.module'
import { SrsExpenseDealerAssignModule } from 'src/features/srs-expense-dealer-assign/srs-expense-dealer-assign.module'
import { SrsLogGenericModule } from 'src/features/srs-log-generic/srs-log-generic.module'
import { SrsLogChangeModule } from 'src/features/srs-log-change/srs-log-change.module'
import { MSG_CATALOG_IN_USE, MSG_MERGE_OTHER_CATEGORY } from './rules/expense-rules'
import { ExpenseCatalogAdminService } from './service/expense-catalog-admin.service'
import { SrsExpenseModule } from './srs-expense.module'

const LOCAL_COPY = 'srssui5_srs_20261107'
const ready = process.env.DB_DATABASE === LOCAL_COPY && process.env.DB_PORT === '3307'
if (!ready) {
  console.warn(`SKIPPED expense-catalog-admin-integration.spec.ts: la base no es la copia local ${LOCAL_COPY} en 127.0.0.1:3307.`)
}
const describeIf = ready ? describe : describe.skip

/** Fixtures de la copia del 07/11 (Auto Wax = 79). */
const PROVIDER = 79
const OTHER_PROVIDER = 188 // GC Installations
const OTHER_COMPANY = 729 // «Brite», compañía de GC
const NORTHERN_ACTIVE = 719
const NORTHERN_INACTIVE_USED = 332 // inactiva, 7 gastos
const NORTHERN_INACTIVE_EMPTY = 333 // inactiva, sin referencias
const SOFTWARE = 637
const SOFTWARE_INACTIVE = 16591 // inactiva, sin referencias
const WINDOW_TINT_FILM = 14340
const ACCIDENT = 17127 // «Accident » (con espacio al final)
const JUAN_SEBASTAIN = 776 // categoría inactiva; 777 es la repetida, más nueva
const ADMIN_USER = 76

const admin: SrsContext = { idUsuario: ADMIN_USER, idUsuarioRolrel: null, idRol: 2, idDealerProvider: PROVIDER, isUserDealer: false, isActive: true }

class Rollback extends Error {}

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

async function catchError(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn()
  } catch (e) {
    return e
  }
  throw new Error('expected the call to throw')
}

function fieldErrorOf(e: unknown): { field: string; message: string } {
  expect(e).toBeInstanceOf(DataError)
  return (e as DataError).validationErrors[0]
}

describeIf('Expenses Settings — borrar, unificar y reactivar (transacción que se deshace)', () => {
  let moduleRef: TestingModule
  let db: DataSource
  let adminService: ExpenseCatalogAdminService
  let catalog: ExpenseCatalogService
  let generic: GenericDataService
  let allowed = true

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
      .overrideProvider(SrsPermissionRepository)
      .useValue({
        userHasRolAccion: async () => allowed,
        assertRolAccion: async () => {
          if (!allowed) throw new ForbiddenException()
        },
      })
      .compile()
    db = moduleRef.get(DataSource)
    adminService = moduleRef.get(ExpenseCatalogAdminService)
    catalog = moduleRef.get(ExpenseCatalogService)
    generic = moduleRef.get(GenericDataService)
  }, 60000)

  afterEach(() => {
    allowed = true
  })

  afterAll(async () => {
    await moduleRef?.close()
  })

  const exists = async (id: number) => (await db.query('SELECT id FROM GENERIC_DATA WHERE id = ?', [id])).length === 1

  /**
   * Corre la operación detrás de un SAVEPOINT de la misma conexión y, si falla, vuelve a él: es lo que hace la
   * transacción del servicio cuando el Merge corre solo (acá corre dentro de la del test, que no se confirma nunca).
   */
  const inSavepoint = async <T>(fn: () => Promise<T>): Promise<T> => {
    await db.query('SAVEPOINT merge_test')
    try {
      return await fn()
    } catch (e) {
      await db.query('ROLLBACK TO SAVEPOINT merge_test')
      throw e
    }
  }

  // ── Listado ───────────────────────────────────────────────────────────────────────────────────────────

  it('lista solo las inactivas con inactiveOnly, marca cuáles se pueden borrar y rechaza los dos filtros juntos', () =>
    inRollback(async () => {
      const page = await catalog.list(admin, 'company', { term: 'Northern Tools', inactiveOnly: '1', pageSize: 50 })
      expect(page.data.every((i) => !i.active)).toBe(true)
      const byId = new Map(page.data.map((i) => [i.id, i]))
      expect(byId.get(NORTHERN_INACTIVE_EMPTY)?.deletable).toBe(true)
      expect(byId.get(NORTHERN_INACTIVE_USED)?.deletable).toBe(false)
      expect(byId.has(NORTHERN_ACTIVE)).toBe(false)

      const active = await catalog.list(admin, 'company', { term: 'Northern Tools', activeOnly: '1' })
      expect(active.data.map((i) => i.id)).toEqual([NORTHERN_ACTIVE])

      const both = await catchError(() => catalog.list(admin, 'company', { activeOnly: '1', inactiveOnly: '1' }))
      expect(both).toBeInstanceOf(BadRequestException)
    }))

  it('devuelve la clase de cierre de cada categoría (tint, accident o ninguna)', () =>
    inRollback(async () => {
      const page = await catalog.list(admin, 'category', { pageSize: 200 })
      const byId = new Map(page.data.map((i) => [i.id, i]))
      expect(byId.get(WINDOW_TINT_FILM)?.closingClass).toBe('tint')
      expect(byId.get(ACCIDENT)?.closingClass).toBe('accident')
      expect(byId.get(SOFTWARE)?.closingClass).toBeNull()
      expect(byId.get(SOFTWARE)?.deletable).toBe(false)
    }))

  // ── Possible duplicates (plans/plan-expenses-posibles-duplicados, T4) ─────────────────────────────────

  it('duplicados: junta los nombres parecidos de la empresa, la activa primero, y nunca los de otra empresa', () =>
    inRollback(async () => {
      const make = (name: string, estado: number, idDealerProvider = PROVIDER) =>
        generic.create({ idCategoria: 34, idDealerProvider, idUsuario: ADMIN_USER, name, type: 1, estado })
      const inactive = await make("TEST dup Lowe's", 0)
      const active = await make('TEST dup LOWES', 1)
      const alone = await make('TEST dup Alone', 1)
      const foreign = await make('TEST dup Lowes', 1, OTHER_PROVIDER)

      const page = await catalog.list(admin, 'company', { term: 'TEST dup', duplicatesOnly: '1' })
      expect(page.data.map((i) => i.id)).toEqual([active.id, inactive.id])
      expect(page.data.map((i) => i.active)).toEqual([true, false])
      expect(page.data[0].duplicateGroup).toBe(page.data[1].duplicateGroup)
      expect(page).toMatchObject({ total: 2, groups: 1 })
      const ids = page.data.map((i) => i.id)
      expect(ids).not.toContain(alone.id)
      expect(ids).not.toContain(foreign.id)

      // Al unificar la inactiva con la activa, el grupo desaparece.
      await adminService.merge(admin, 'company', inactive.id, active.id)
      expect(await catalog.list(admin, 'company', { term: 'TEST dup', duplicatesOnly: '1' })).toMatchObject({ data: [], total: 0, groups: 0 })
    }))

  it('duplicados con los datos de Auto Wax: Home Depot sale junto, The Home Depot (activa) primero', () =>
    inRollback(async () => {
      const page = await catalog.list(admin, 'company', { duplicatesOnly: '1', pageSize: 200 })
      const homeDepot = page.data.filter((i) => /home depot/i.test(i.name))
      expect(homeDepot.length).toBe(4)
      expect(homeDepot[0]).toMatchObject({ name: 'The Home Depot', active: true })
      expect(new Set(homeDepot.map((i) => i.duplicateGroup)).size).toBe(1)
      const first = page.data.findIndex((i) => i.id === homeDepot[0].id)
      expect(page.data.slice(first, first + 4).map((i) => i.id)).toEqual(homeDepot.map((i) => i.id))
      expect(page.groups).toBe(7)

      const categories = await catalog.list(admin, 'category', { duplicatesOnly: '1' })
      expect(categories.groups).toBe(2)
    }))

  it('duplicados: con otro filtro devuelve 400 y sin permiso 403', () =>
    inRollback(async () => {
      expect(await catchError(() => catalog.list(admin, 'company', { duplicatesOnly: '1', inactiveOnly: '1' }))).toBeInstanceOf(BadRequestException)
      expect(await catchError(() => catalog.list(admin, 'company', { duplicatesOnly: '1', activeOnly: '1' }))).toBeInstanceOf(BadRequestException)
      allowed = false
      expect(await catchError(() => catalog.list(admin, 'company', { duplicatesOnly: '1' }))).toBeInstanceOf(ForbiddenException)
    }))

  // ── Delete ────────────────────────────────────────────────────────────────────────────────────────────

  it('borra una compañía sin referencias; con gastos devuelve 409; de otra empresa 404; sin permiso 403', () =>
    inRollback(async () => {
      await adminService.remove(admin, 'company', NORTHERN_INACTIVE_EMPTY)
      expect(await exists(NORTHERN_INACTIVE_EMPTY)).toBe(false)

      const used = await catchError(() => adminService.remove(admin, 'company', NORTHERN_INACTIVE_USED))
      expect(used).toBeInstanceOf(ConflictException)
      expect((used as Error).message).toBe(MSG_CATALOG_IN_USE)
      expect(await exists(NORTHERN_INACTIVE_USED)).toBe(true)

      expect(await catchError(() => adminService.remove(admin, 'company', OTHER_COMPANY))).toBeInstanceOf(NotFoundException)
      expect(await exists(OTHER_COMPANY)).toBe(true)

      allowed = false
      expect(await catchError(() => adminService.remove(admin, 'category', SOFTWARE_INACTIVE))).toBeInstanceOf(ForbiddenException)
      expect(await exists(SOFTWARE_INACTIVE)).toBe(true)
    }))

  it('no borra si solo tiene gastos borrados, una regla o una compañía que la tiene de última categoría', () =>
    inRollback(async () => {
      // Compañía con un solo gasto, borrado.
      const company = await generic.create({ idCategoria: 34, idDealerProvider: PROVIDER, idUsuario: ADMIN_USER, name: 'TEST deleted only', type: 1, estado: 0 })
      const [expense] = await db.query('SELECT id FROM EXP_EXPENSE WHERE id_company = ? AND id_detailer = ? LIMIT 1', [NORTHERN_ACTIVE, PROVIDER])
      await db.query('UPDATE EXP_EXPENSE SET id_company = ?, estado = 0 WHERE id = ?', [company.id, expense.id])
      expect((await catalog.list(admin, 'company', { term: 'TEST deleted only' })).data[0]).toMatchObject({ expensesCount: 0, deletable: false })
      expect(await catchError(() => adminService.remove(admin, 'company', company.id))).toBeInstanceOf(ConflictException)

      // Categoría que es la última de una compañía.
      await db.query('UPDATE GENERIC_DATA SET id_parent = ? WHERE id = ?', [SOFTWARE_INACTIVE, NORTHERN_INACTIVE_EMPTY])
      expect(await catchError(() => adminService.remove(admin, 'category', SOFTWARE_INACTIVE))).toBeInstanceOf(ConflictException)
      expect(await exists(SOFTWARE_INACTIVE)).toBe(true)
    }))

  // ── Merge de compañías ────────────────────────────────────────────────────────────────────────────────

  it('unifica compañías: los gastos pasan a la elegida con su log, la fila se borra y la plata por dealer no cambia', () =>
    inRollback(async () => {
      const sumByDealer = async (ids: number[]) =>
        db.query(
          `SELECT id_dealer, ROUND(SUM(amount), 2) AS total, COUNT(*) AS n FROM EXP_EXPENSE
            WHERE id_company IN (?) AND id_detailer = ? GROUP BY id_dealer ORDER BY id_dealer`,
          [ids, PROVIDER],
        )
      const before = await sumByDealer([NORTHERN_ACTIVE, NORTHERN_INACTIVE_USED])
      const moving: { id: number }[] = await db.query('SELECT id FROM EXP_EXPENSE WHERE id_company = ? AND id_detailer = ?', [NORTHERN_INACTIVE_USED, PROVIDER])
      expect(moving.length).toBeGreaterThan(0)

      const usage = await adminService.usage(admin, 'company', NORTHERN_INACTIVE_USED)
      expect(usage.expenses + usage.deletedExpenses).toBeGreaterThan(0)
      expect(usage.rules).toBe(0)

      const result = await adminService.merge(admin, 'company', NORTHERN_INACTIVE_USED, NORTHERN_ACTIVE)
      expect(result.expensesMoved).toBe(moving.length)
      expect(result.target.id).toBe(NORTHERN_ACTIVE)
      expect(await exists(NORTHERN_INACTIVE_USED)).toBe(false)
      expect(await sumByDealer([NORTHERN_ACTIVE])).toEqual(before)

      const logs: { id_expense: number; description: string; tipo: number }[] = await db.query(
        'SELECT id_expense, description, tipo FROM LOG_GENERIC WHERE id_expense IN (?) AND description LIKE ?',
        [moving.map((m) => m.id), '%merged in Settings%'],
      )
      expect(logs).toHaveLength(moving.length)
      expect(logs[0]).toMatchObject({ description: 'Company: Northern Tools -> Northern Tools (merged in Settings)', tipo: 7 })
    }))

  it('unificar mueve las reglas recurrentes de la empresa y deja su línea en LOG_CHANGE', () =>
    inRollback(async () => {
      const [rule] = await db.query('SELECT id FROM EXP_EXPENSE_REPETITIVE WHERE id_dealer_provider = ? LIMIT 1', [PROVIDER])
      await db.query('UPDATE EXP_EXPENSE_REPETITIVE SET id_company = ? WHERE id = ?', [NORTHERN_INACTIVE_EMPTY, rule.id])
      expect((await adminService.usage(admin, 'company', NORTHERN_INACTIVE_EMPTY)).rules).toBe(1)

      const result = await adminService.merge(admin, 'company', NORTHERN_INACTIVE_EMPTY, NORTHERN_ACTIVE)
      expect(result.rulesMoved).toBe(1)
      const [after] = await db.query('SELECT id_company FROM EXP_EXPENSE_REPETITIVE WHERE id = ?', [rule.id])
      expect(Number(after.id_company)).toBe(NORTHERN_ACTIVE)
      const log = await db.query('SELECT desc_cambio FROM LOG_CHANGE WHERE id_exp_repetitive = ? AND desc_cambio LIKE ?', [rule.id, '%merged in Settings%'])
      expect(log).toHaveLength(1)
    }))

  it('no toca gastos de otra empresa: con una referencia ajena devuelve 409 y deja todo como estaba', () =>
    inRollback(async () => {
      // Un gasto de GC que apunta a una compañía de Auto Wax (el PHP lo permite; en la copia no hay ninguno).
      const [foreign] = await db.query('SELECT id, id_company FROM EXP_EXPENSE WHERE id_detailer = ? LIMIT 1', [OTHER_PROVIDER])
      await db.query('UPDATE EXP_EXPENSE SET id_company = ? WHERE id = ?', [NORTHERN_INACTIVE_USED, foreign.id])
      const ownBefore = await db.query('SELECT COUNT(*) AS n FROM EXP_EXPENSE WHERE id_company = ? AND id_detailer = ?', [NORTHERN_INACTIVE_USED, PROVIDER])

      const usage = await adminService.usage(admin, 'company', NORTHERN_INACTIVE_USED)
      expect(usage.expenses + usage.deletedExpenses).toBeLessThanOrEqual(Number(ownBefore[0].n))

      const err = await catchError(() => inSavepoint(() => adminService.merge(admin, 'company', NORTHERN_INACTIVE_USED, NORTHERN_ACTIVE)))
      expect(err).toBeInstanceOf(ConflictException)

      const [foreignAfter] = await db.query('SELECT id_company FROM EXP_EXPENSE WHERE id = ?', [foreign.id])
      expect(Number(foreignAfter.id_company)).toBe(NORTHERN_INACTIVE_USED)
      const ownAfter = await db.query('SELECT COUNT(*) AS n FROM EXP_EXPENSE WHERE id_company = ? AND id_detailer = ?', [NORTHERN_INACTIVE_USED, PROVIDER])
      expect(Number(ownAfter[0].n)).toBe(Number(ownBefore[0].n))
      const foreignLogs = await db.query('SELECT id FROM LOG_GENERIC WHERE id_expense = ? AND description LIKE ?', [foreign.id, '%merged in Settings%'])
      expect(foreignLogs).toHaveLength(0)
      expect(await exists(NORTHERN_INACTIVE_USED)).toBe(true)
    }))

  it('rechaza unificar con la misma fila, con una inactiva o con una de otra empresa', () =>
    inRollback(async () => {
      expect(fieldErrorOf(await catchError(() => adminService.merge(admin, 'company', NORTHERN_ACTIVE, NORTHERN_ACTIVE))).field).toBe('targetId')
      expect(fieldErrorOf(await catchError(() => adminService.merge(admin, 'company', NORTHERN_INACTIVE_EMPTY, NORTHERN_INACTIVE_USED))).field).toBe('targetId')
      expect(await catchError(() => adminService.merge(admin, 'company', NORTHERN_INACTIVE_EMPTY, OTHER_COMPANY))).toBeInstanceOf(NotFoundException)
      expect(fieldErrorOf(await catchError(() => adminService.merge(admin, 'company', NORTHERN_INACTIVE_EMPTY, undefined))).field).toBe('targetId')
      expect(await exists(NORTHERN_INACTIVE_EMPTY)).toBe(true)
    }))

  // ── Merge de categorías ───────────────────────────────────────────────────────────────────────────────

  it('no une categorías de distinta clase de cierre (Window Tint Film, Accident, el resto)', () =>
    inRollback(async () => {
      for (const [from, to] of [
        [WINDOW_TINT_FILM, SOFTWARE],
        [SOFTWARE, ACCIDENT],
        [ACCIDENT, SOFTWARE],
      ]) {
        const e = fieldErrorOf(await catchError(() => adminService.merge(admin, 'category', from, to)))
        expect(e).toEqual({ field: 'targetId', message: MSG_MERGE_OTHER_CATEGORY })
        expect(await exists(from)).toBe(true)
      }
    }))

  it('une una «window tint film» repetida con la activa y el total de tint por dealer no cambia', () =>
    inRollback(async () => {
      const tintByDealer = () =>
        db.query(
          `SELECT e.id_dealer, ROUND(SUM(e.amount), 2) AS total FROM EXP_EXPENSE e
             JOIN GENERIC_DATA g ON g.id = e.id_category AND g.id_categoria = 35
            WHERE e.id_detailer = ? AND e.estado = 1 AND LOWER(TRIM(g.name)) = 'window tint film'
            GROUP BY e.id_dealer ORDER BY e.id_dealer`,
          [PROVIDER],
        )
      const duplicate = await generic.create({ idCategoria: 35, idDealerProvider: PROVIDER, idUsuario: ADMIN_USER, name: 'window tint film ', type: 1, estado: 0 })
      const [expense] = await db.query('SELECT id FROM EXP_EXPENSE WHERE id_category = ? AND id_detailer = ? AND estado = 1 LIMIT 1', [WINDOW_TINT_FILM, PROVIDER])
      await db.query('UPDATE EXP_EXPENSE SET id_category = ? WHERE id = ?', [duplicate.id, expense.id])
      const before = await tintByDealer()

      const result = await adminService.merge(admin, 'category', duplicate.id, WINDOW_TINT_FILM)
      expect(result.expensesMoved).toBe(1)
      expect(await tintByDealer()).toEqual(before)
      expect(await exists(duplicate.id)).toBe(false)
    }))

  it('al unificar categorías, las compañías que la tenían de última pasan a la elegida', () =>
    inRollback(async () => {
      await db.query('UPDATE GENERIC_DATA SET id_parent = ? WHERE id = ?', [SOFTWARE_INACTIVE, NORTHERN_ACTIVE])
      expect((await adminService.usage(admin, 'category', SOFTWARE_INACTIVE)).companies).toBe(1)
      const result = await adminService.merge(admin, 'category', SOFTWARE_INACTIVE, SOFTWARE)
      expect(result.companiesUpdated).toBe(1)
      const [company] = await db.query('SELECT id_parent FROM GENERIC_DATA WHERE id = ?', [NORTHERN_ACTIVE])
      expect(Number(company.id_parent)).toBe(SOFTWARE)
      expect(await exists(SOFTWARE_INACTIVE)).toBe(false)
    }))

  // ── Alta sin repetidas (D3) ───────────────────────────────────────────────────────────────────────────

  it('alta con el nombre de una activa: la devuelve (existing, sin reactivar)', () =>
    inRollback(async () => {
      const created = await catalog.create(admin, 'company', { name: '  northern tools ' })
      expect(created).toMatchObject({ id: NORTHERN_ACTIVE, existing: true, reactivated: false })
    }))

  it('alta con el nombre de una inactiva: reactiva la más vieja y no crea otra', () =>
    inRollback(async () => {
      const [{ n: before }] = await db.query('SELECT COUNT(*) AS n FROM GENERIC_DATA WHERE id_dealer_provider = ? AND id_categoria = 35', [PROVIDER])
      const created = await catalog.create(admin, 'category', { name: 'juan sebastain mella happe' })
      expect(created).toMatchObject({ id: JUAN_SEBASTAIN, existing: true, reactivated: true, active: true })
      const [row] = await db.query('SELECT estado FROM GENERIC_DATA WHERE id = ?', [JUAN_SEBASTAIN])
      expect(Number(row.estado)).toBe(1)
      const [{ n: after }] = await db.query('SELECT COUNT(*) AS n FROM GENERIC_DATA WHERE id_dealer_provider = ? AND id_categoria = 35', [PROVIDER])
      expect(Number(after)).toBe(Number(before))
    }))

  it('alta con un nombre nuevo: lo crea sin espacios de borde', () =>
    inRollback(async () => {
      const created = await catalog.create(admin, 'company', { name: '  TEST brand new  ' })
      expect(created).toMatchObject({ name: 'TEST brand new', existing: false, reactivated: false, deletable: true })
    }))
})
