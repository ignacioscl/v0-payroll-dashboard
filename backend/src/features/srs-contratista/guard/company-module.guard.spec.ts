/**
 * Check por empresa «Expenses» y «Window Tint Closing» (plans/plan-checks-expenses-tint, T8/T9): el guard, el control
 * del servicio y que todo controller de `/srs/expenses` lo tenga. Sin base: el repositorio es un doble.
 */
import { readdirSync } from 'fs'
import { join } from 'path'
import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { Reflector } from '@nestjs/core'

import { SrsContext } from 'src/srs/auth/srs-auth-context.service'
import { SrsJwtGuard } from 'src/srs/auth/srs-jwt.guard'
import { ContratistaService } from '../service/contratista.service'
import { COMPANY_MODULE_KEY, CompanyModuleGuard, RequireCompanyModule } from './company-module.guard'

const AUTO_WAX = 79 // Expenses y Window Tint Closing
const GC = 188 // solo Expenses
const MOOI = 749 // ninguno

const companies: Record<number, { id: number; hasExpenses: number; hasWindowTintClosing: number }> = {
  [AUTO_WAX]: { id: AUTO_WAX, hasExpenses: 1, hasWindowTintClosing: 1 },
  [GC]: { id: GC, hasExpenses: 1, hasWindowTintClosing: 0 },
  [MOOI]: { id: MOOI, hasExpenses: 0, hasWindowTintClosing: 0 },
}

function service(): ContratistaService {
  const repository = {
    findOne: async ({ where: { id } }: { where: { id: number } }) => companies[id] ?? null,
  }
  return new ContratistaService(repository as any)
}

const ctx = (idDealerProvider: number): SrsContext => ({
  idUsuario: 1,
  idUsuarioRolrel: null,
  idRol: 2,
  idDealerProvider,
  isUserDealer: false,
  isActive: true,
})

@RequireCompanyModule('expenses')
class ExpensesOnlyController {
  handler() {}
}

class FreeController {
  handler() {}
}

function executionContext(controller: new () => any, srsContext?: SrsContext): ExecutionContext {
  return {
    getHandler: () => controller.prototype.handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ srsContext }) }),
  } as unknown as ExecutionContext
}

describe('ContratistaService — check de módulo de la empresa', () => {
  it('lee cada check de su columna', async () => {
    const s = service()
    expect(await s.hasCompanyModule(AUTO_WAX, 'expenses')).toBe(true)
    expect(await s.hasCompanyModule(AUTO_WAX, 'windowTintClosing')).toBe(true)
    expect(await s.hasCompanyModule(GC, 'expenses')).toBe(true)
    expect(await s.hasCompanyModule(GC, 'windowTintClosing')).toBe(false)
    expect(await s.hasCompanyModule(MOOI, 'expenses')).toBe(false)
    expect(await s.hasCompanyModule(999999, 'expenses')).toBe(false)
  })

  it('assertCompanyModule: 403 sin el check', async () => {
    const s = service()
    await expect(s.assertCompanyModule(ctx(GC), 'expenses')).resolves.toBeUndefined()
    await expect(s.assertCompanyModule(ctx(GC), 'windowTintClosing')).rejects.toBeInstanceOf(ForbiddenException)
    await expect(s.assertCompanyModule(ctx(MOOI), 'expenses')).rejects.toBeInstanceOf(ForbiddenException)
  })
})

describe('CompanyModuleGuard', () => {
  const guard = new CompanyModuleGuard(new Reflector(), service())

  it('empresa con el check: pasa', async () => {
    await expect(guard.canActivate(executionContext(ExpensesOnlyController, ctx(AUTO_WAX)))).resolves.toBe(true)
  })

  it('empresa sin el check: 403, haya o no permiso', async () => {
    await expect(guard.canActivate(executionContext(ExpensesOnlyController, ctx(MOOI)))).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('sin srsContext: no pasa', async () => {
    await expect(guard.canActivate(executionContext(ExpensesOnlyController))).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('un controller sin @RequireCompanyModule no se toca', async () => {
    await expect(guard.canActivate(executionContext(FreeController, ctx(MOOI)))).resolves.toBe(true)
  })
})

/** Todos los `*.controller.ts` de src, para que un controller nuevo de Expenses sin el guard haga fallar este test. */
function controllerFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.controller.ts'))
    .map((f) => join(dir, f))
}

describe('Todo controller de /srs/expenses tiene el check «Expenses»', () => {
  const root = join(__dirname, '..', '..', '..')
  const expenseControllers: { name: string; ctrl: any }[] = []
  for (const file of controllerFiles(root)) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(file)
    for (const exported of Object.values(mod)) {
      if (typeof exported !== 'function') continue
      const path = Reflect.getMetadata(PATH_METADATA, exported)
      if (typeof path === 'string' && /^\/?srs\/expenses(\/|$)/.test(path)) {
        expenseControllers.push({ name: (exported as any).name, ctrl: exported })
      }
    }
  }

  it('encuentra los cuatro de hoy', () => {
    expect(expenseControllers.map((c) => c.name).sort()).toEqual([
      'ExpenseCatalogController',
      'ExpenseController',
      'ExpenseReportController',
      'RecurringExpenseController',
    ])
  })

  it.each(expenseControllers.map((c) => [c.name, c.ctrl]))('%s: SrsJwtGuard + CompanyModuleGuard + expenses', (_, ctrl) => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ctrl) as unknown[]
    expect(guards).toEqual([SrsJwtGuard, CompanyModuleGuard])
    expect(Reflect.getMetadata(COMPANY_MODULE_KEY, ctrl)).toBe('expenses')
  })
})
