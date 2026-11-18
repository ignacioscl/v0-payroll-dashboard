/**
 * Checks por empresa «Expenses» y «Window Tint Closing» (plans/plan-checks-expenses-tint, T7/T9): menú, rutas y
 * permisos con cada combinación de permiso × check, también en dev (el bypass de dev es solo para permisos).
 */
import { describe, expect, it } from 'vitest'

import { canAccessExpenses, ROL_ACCION_EXPENSES_APPROVE } from './auth/expenses-permissions'
import { canAccessMonthlyClosing, canAccessOpenInvoices, canAccessWindowTintClosing } from './auth/payroll-access'
import { ROL_ACCION_CLOSING, ROL_ACCION_DUE_ON_BILLING } from './auth/ttk-permissions'
import type { SrsMeUser } from './auth/types'
import type { NavItem } from './navigation'
import fs from 'node:fs'
import path from 'node:path'
import {
  ALL_NAVIGATION,
  DEV_ONLY_HREFS,
  EXPENSES_NAV_HREFS,
  getScreenAccess,
  getVisibleNavigation,
  isCompanyModuleBlockedPath,
  isProdAllowedPath,
  ROLES_NAV_HREFS,
  SETTINGS_NAV_HREFS,
} from './navigation'
import { ROL_ACCION_INVOICES_MODULE_ACCESS, ROL_ACCION_TTK_ADMIN_HOURS } from './auth/ttk-permissions'

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

// ---- Etapa 4.6: una sola función decide el acceso a una pantalla (P5) ----

function dashboardRoutes(): string[] {
  const base = path.join(__dirname, '..', 'app', '(dashboard)')
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name === 'page.tsx') {
        const rel = path.relative(base, dir).split(path.sep).filter((s) => s && !/^\(.*\)$/.test(s))
        out.push('/' + rel.join('/'))
      }
    }
  }
  walk(base)
  return out
}

describe('toda pantalla está clasificada', () => {
  it('cada ruta de app/(dashboard) está en un módulo del menú, en una lista de permisos o en DEV_ONLY_HREFS', () => {
    const classified = [
      ...ALL_NAVIGATION.flatMap((item) => [item.href, ...(item.children ?? []).map((c) => c.href)]).filter(
        (href) => !(DEV_ONLY_HREFS as readonly string[]).includes(href),
      ),
      ...EXPENSES_NAV_HREFS,
      ...ROLES_NAV_HREFS,
      ...SETTINGS_NAV_HREFS,
      ...DEV_ONLY_HREFS,
    ]
    const isClassified = (route: string) =>
      classified.some((href) => route === href || (href !== '/' && route.startsWith(`${href}/`)))
    const missing = dashboardRoutes().filter((route) => !isClassified(route))
    expect(missing).toEqual([])
  })

  it('las pantallas de DEV_ONLY_HREFS en producción se niegan, aun para el admin', () => {
    const admin = { user: user({ isSystemAdmin: true }), permissionIds: [] }
    for (const href of DEV_ONLY_HREFS) {
      expect(getScreenAccess(href, admin, { isDev: false }), href).toBe('denied')
      expect(getScreenAccess(href, admin, { isDev: true }), href).toBe('allowed')
    }
  })
})

describe('getScreenAccess', () => {
  const ttk = { user: user(), permissionIds: [ROL_ACCION_TTK_ADMIN_HOURS] }

  it('sin rol del panel → no-dashboard', () => {
    expect(getScreenAccess('/', { user: user({ idRolSystemV2: null }), permissionIds: [] }, { isDev: false })).toBe('no-dashboard')
  })
  it('sin ningún módulo, en producción → no-modules', () => {
    expect(getScreenAccess('/issues', { user: user(), permissionIds: [] }, { isDev: false })).toBe('no-modules')
  })
  it('sin el módulo de la empresa → no-module, también en dev', () => {
    const admin = { user: user({ isSystemAdmin: true, hasExpenses: false }), permissionIds: [] }
    expect(getScreenAccess('/expenses', admin, { isDev: false })).toBe('no-module')
    expect(getScreenAccess('/expenses/analytics', admin, { isDev: true })).toBe('no-module')
  })
  it('sin el permiso de la pantalla → denied; con el permiso → allowed', () => {
    expect(getScreenAccess('/billing/invoices', ttk, { isDev: false })).toBe('denied')
    expect(getScreenAccess('/issues', ttk, { isDev: false })).toBe('allowed')
    const billing = { user: user(), permissionIds: [ROL_ACCION_INVOICES_MODULE_ACCESS] }
    expect(getScreenAccess('/billing/invoices', billing, { isDev: false })).toBe('allowed')
  })
  it('externo en / → denied (al externo lo manda a Punch Report el proxy); en /issues → allowed', () => {
    const external = { user: user({ isCompanyTypeCompany: true }), permissionIds: [ROL_ACCION_TTK_ADMIN_HOURS] }
    expect(getScreenAccess('/', external, { isDev: false })).toBe('denied')
    expect(getScreenAccess('/issues', external, { isDev: false })).toBe('allowed')
  })
})

/**
 * Reports › Open Invoices (plans/plan-reporte-javier §4.3, §7.3): «Reports > Due On Billing» (123) abre el reporte y sus
 * fotos. Un rol con SOLO 123 ve el menú y la pantalla en producción (no «sin módulos»: hallazgo de la review 1).
 */
describe('Open Invoices (123)', () => {
  const only123 = { user: user(), permissionIds: [ROL_ACCION_DUE_ON_BILLING] }
  const without = { user: user(), permissionIds: [ROL_ACCION_TTK_ADMIN_HOURS] }

  it('un rol con solo 123 entra en producción, al reporte y a la comparación', () => {
    expect(getScreenAccess('/reports/open-invoices', only123, { isDev: false })).toBe('allowed')
    expect(getScreenAccess('/reports/open-invoices/snapshots/7', only123, { isDev: false })).toBe('allowed')
    expect(getScreenAccess('/reports/monthly-closing', only123, { isDev: false })).toBe('denied')
  })

  it('sin 123 no entra; Admin General y Admin Company sí', () => {
    expect(getScreenAccess('/reports/open-invoices', without, { isDev: false })).toBe('denied')
    expect(canAccessOpenInvoices(user(), none)).toBe(false)
    expect(canAccessOpenInvoices(user({ isSystemAdmin: true }), none)).toBe(true)
  })

  it('el menú de un rol con solo 123 trae Reports › Open Invoices y nada más', () => {
    const items = getVisibleNavigation({
      isDev: false,
      canAccessTtk: false,
      canAccessOpenInvoices: true,
      companyModules: { companyHasExpenses: true, companyHasWindowTintClosing: true },
      t,
    })
    expect(hrefs(items)).toEqual(['/reports/business-kpis', '/reports/open-invoices'])
  })

  it('sin 123 el menú no lo trae', () => {
    const items = getVisibleNavigation({
      isDev: false,
      canAccessTtk: true,
      companyModules: { companyHasExpenses: true, companyHasWindowTintClosing: true },
      t,
    })
    expect(hrefs(items)).not.toContain('/reports/open-invoices')
  })

  it('isProdAllowedPath abre la ruta solo con la bandera de Open Invoices', () => {
    expect(isProdAllowedPath('/reports/open-invoices', false, false, false, false, false, false, false, false, false, false, true)).toBe(true)
    expect(isProdAllowedPath('/reports/open-invoices', false, false, false, false, false, false, false, false, false, false, false)).toBe(false)
  })
})
