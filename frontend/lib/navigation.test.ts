/**
 * Checks por empresa «Expenses» y «Window Tint Closing» (plans/plan-checks-expenses-tint, T7/T9): menú, rutas y
 * permisos con cada combinación de permiso × check, también en dev (el bypass de dev es solo para permisos).
 */
import { describe, expect, it } from 'vitest'

import { canAccessExpenses, ROL_ACCION_EXPENSES_APPROVE } from './auth/expenses-permissions'
import { canAccessMonthlyClosing, canAccessWindowTintClosing } from './auth/payroll-access'
import { ROL_ACCION_CLOSING } from './auth/ttk-permissions'
import type { SrsMeUser } from './auth/types'
import type { NavItem } from './navigation'
import { getVisibleNavigation, isCompanyModuleBlockedPath, isProdAllowedPath } from './navigation'

const t = (key: string) => key

const user = (overrides: Partial<SrsMeUser> = {}): SrsMeUser => ({
  id: 1,
  nombre: 'Test',
  email: '',
  codigoInterno: '',
  thumbnailUuid: null,
  logoImg: null,
  idRolSystemV2: 1,
  rolSystemV2Name: null,
  idDealer: null,
  dealerName: null,
  idDealerProvider: 79,
  isCompanyTypeCompany: false,
  isSystemAdmin: false,
  ...overrides,
})

const granted = (...ids: number[]) => (id: number) => ids.includes(id)
const none = () => false

const hrefs = (items: NavItem[]): string[] =>
  items.flatMap((item) => [item.href, ...(item.children ?? []).map((child) => child.href)])

describe('canAccessExpenses', () => {
  it('sin el check de la empresa: nunca, ni con 111 ni siendo admin', () => {
    expect(canAccessExpenses(granted(ROL_ACCION_EXPENSES_APPROVE), true, false)).toBe(false)
    expect(canAccessExpenses(granted(ROL_ACCION_EXPENSES_APPROVE), false, undefined)).toBe(false)
  })

  it('con el check: manda el permiso (111 o admin)', () => {
    expect(canAccessExpenses(granted(ROL_ACCION_EXPENSES_APPROVE), false, true)).toBe(true)
    expect(canAccessExpenses(none, true, true)).toBe(true)
    expect(canAccessExpenses(none, false, true)).toBe(false)
  })
})

describe('canAccessWindowTintClosing', () => {
  it('pide el permiso de Monthly Closing y el check de la empresa', () => {
    const closing = granted(ROL_ACCION_CLOSING)
    expect(canAccessWindowTintClosing(user({ hasWindowTintClosing: true }), closing)).toBe(true)
    expect(canAccessWindowTintClosing(user({ hasWindowTintClosing: false }), closing)).toBe(false)
    expect(canAccessWindowTintClosing(user({ isSystemAdmin: true }), none)).toBe(false)
    expect(canAccessWindowTintClosing(user({ hasWindowTintClosing: true }), none)).toBe(false)
  })

  it('Monthly Closing no mira el check', () => {
    expect(canAccessMonthlyClosing(user({ hasWindowTintClosing: false }), granted(ROL_ACCION_CLOSING))).toBe(true)
  })
})

describe('isProdAllowedPath', () => {
  const allowed = (pathname: string, expenses: boolean, monthly: boolean, tint: boolean) =>
    isProdAllowedPath(pathname, false, false, false, false, false, false, false, expenses, monthly, tint)

  it('Monthly Closing y Window Tint Closing van por separado', () => {
    expect(allowed('/reports/monthly-closing', false, true, false)).toBe(true)
    expect(allowed('/reports/window-tint-closing', false, true, false)).toBe(false)
    expect(allowed('/reports/window-tint-closing', false, true, true)).toBe(true)
  })

  it('Expenses y sus subrutas, solo con acceso', () => {
    for (const path of ['/expenses', '/expenses/new', '/expenses/12/edit', '/expenses/recurring/3']) {
      expect(allowed(path, false, true, true)).toBe(false)
      expect(allowed(path, true, false, false)).toBe(true)
    }
  })
})

describe('isCompanyModuleBlockedPath', () => {
  it('bloquea las rutas del módulo que la empresa no tiene', () => {
    const none = { companyHasExpenses: false, companyHasWindowTintClosing: false }
    expect(isCompanyModuleBlockedPath('/expenses', none)).toBe(true)
    expect(isCompanyModuleBlockedPath('/expenses/recurring/3', none)).toBe(true)
    expect(isCompanyModuleBlockedPath('/reports/window-tint-closing', none)).toBe(true)
    expect(isCompanyModuleBlockedPath('/reports/monthly-closing', none)).toBe(false)
    expect(isCompanyModuleBlockedPath('/expenses-other', none)).toBe(false)
    const both = { companyHasExpenses: true, companyHasWindowTintClosing: true }
    expect(isCompanyModuleBlockedPath('/expenses', both)).toBe(false)
    expect(isCompanyModuleBlockedPath('/reports/window-tint-closing', both)).toBe(false)
  })
})

describe('getVisibleNavigation', () => {
  const nav = (
    isDev: boolean,
    access: { expenses: boolean; monthly: boolean; tint: boolean },
    company: { companyHasExpenses: boolean; companyHasWindowTintClosing: boolean },
  ) =>
    hrefs(
      getVisibleNavigation({
        isDev,
        canAccessTtk: true,
        canAccessExpenses: access.expenses,
        canAccessMonthlyClosing: access.monthly,
        canAccessWindowTintClosing: access.tint,
        companyModules: company,
        t,
      }),
    )

  it('prod: sin el check de la empresa no aparecen Expenses ni Window Tint Closing', () => {
    const items = nav(
      false,
      { expenses: false, monthly: true, tint: false },
      { companyHasExpenses: false, companyHasWindowTintClosing: false },
    )
    expect(items).toContain('/reports/monthly-closing')
    expect(items).not.toContain('/reports/window-tint-closing')
    expect(items.some((h) => h.startsWith('/expenses'))).toBe(false)
  })

  it('prod: con acceso aparecen los dos', () => {
    const items = nav(
      false,
      { expenses: true, monthly: true, tint: true },
      { companyHasExpenses: true, companyHasWindowTintClosing: true },
    )
    expect(items).toEqual(expect.arrayContaining(['/expenses', '/expenses/recurring', '/reports/window-tint-closing']))
  })

  it('dev: muestra todo salvo los módulos que la empresa no tiene', () => {
    const gc = nav(
      true,
      { expenses: false, monthly: false, tint: false },
      { companyHasExpenses: true, companyHasWindowTintClosing: false },
    )
    expect(gc).toContain('/expenses')
    expect(gc).toContain('/reports/monthly-closing')
    expect(gc).not.toContain('/reports/window-tint-closing')

    const mooi = nav(
      true,
      { expenses: false, monthly: false, tint: false },
      { companyHasExpenses: false, companyHasWindowTintClosing: false },
    )
    expect(mooi.some((h) => h.startsWith('/expenses'))).toBe(false)
    expect(mooi).not.toContain('/reports/window-tint-closing')
    expect(mooi).toContain('/roles')
  })
})
