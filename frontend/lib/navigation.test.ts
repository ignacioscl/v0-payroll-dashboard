/**
 * Checks por empresa «Expenses» y «Closing reports» (plans/plan-checks-expenses-tint, T7/T9; «Closing reports» era
 * «Window Tint Closing» y desde D17 de plans/plan-reunion-juan-18-11 abre también Monthly Closing y Open Invoices): menú,
 * rutas y permisos con cada combinación de permiso × check, también en dev (el bypass de dev es solo para permisos).
 * Un permiso por reporte (tema 10, migration 033): cada id abre su pantalla y ninguna otra.
 */
import { describe, expect, it } from 'vitest'

import { canAccessExpenses, ROL_ACCION_EXPENSES_APPROVE } from './auth/expenses-permissions'
import { canAccessMonthlyClosing, canAccessOpenInvoices, canAccessWindowTintClosing } from './auth/payroll-access'
import {
  ROL_ACCION_REPORT_BUSINESS_KPIS,
  ROL_ACCION_REPORT_INCOME_BY_DEALER,
  ROL_ACCION_REPORT_MONTHLY_CLOSING,
  ROL_ACCION_REPORT_OPEN_INVOICES,
  ROL_ACCION_REPORT_PRODUCTION_VS_GOAL,
  ROL_ACCION_REPORT_WINDOW_TINT_CLOSING,
} from './auth/ttk-permissions'
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

describe('los tres de «Closing reports»: su permiso y el módulo de la empresa (D17)', () => {
  const reports = [
    ['Monthly Closing', canAccessMonthlyClosing, ROL_ACCION_REPORT_MONTHLY_CLOSING],
    ['Window Tint Closing', canAccessWindowTintClosing, ROL_ACCION_REPORT_WINDOW_TINT_CLOSING],
    ['Open Invoices', canAccessOpenInvoices, ROL_ACCION_REPORT_OPEN_INVOICES],
  ] as const

  it.each(reports)('%s: su permiso con el módulo; sin el módulo, nunca (ni el admin)', (_name, can, id) => {
    expect(can(user({ hasWindowTintClosing: true }), granted(id))).toBe(true)
    expect(can(user({ hasWindowTintClosing: false }), granted(id))).toBe(false)
    expect(can(user({ hasWindowTintClosing: true }), none)).toBe(false)
    expect(can(user({ isSystemAdmin: true, hasWindowTintClosing: true }), none)).toBe(true)
    expect(can(user({ isSystemAdmin: true }), none)).toBe(false)
  })

  it('el permiso de uno no abre los otros dos', () => {
    const withModule = user({ hasWindowTintClosing: true })
    expect(canAccessWindowTintClosing(withModule, granted(ROL_ACCION_REPORT_MONTHLY_CLOSING))).toBe(false)
    expect(canAccessOpenInvoices(withModule, granted(ROL_ACCION_REPORT_MONTHLY_CLOSING))).toBe(false)
    expect(canAccessMonthlyClosing(withModule, granted(ROL_ACCION_REPORT_WINDOW_TINT_CLOSING))).toBe(false)
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
    const none = { companyHasExpenses: false, companyHasClosingReports: false }
    expect(isCompanyModuleBlockedPath('/expenses', none)).toBe(true)
    expect(isCompanyModuleBlockedPath('/expenses/recurring/3', none)).toBe(true)
    expect(isCompanyModuleBlockedPath('/reports/window-tint-closing', none)).toBe(true)
    expect(isCompanyModuleBlockedPath('/reports/monthly-closing', none)).toBe(true)
    expect(isCompanyModuleBlockedPath('/reports/open-invoices', none)).toBe(true)
    expect(isCompanyModuleBlockedPath('/reports/open-invoices/snapshots/7', none)).toBe(true)
    expect(isCompanyModuleBlockedPath('/reports/business-kpis', none)).toBe(false)
    expect(isCompanyModuleBlockedPath('/reports/income-by-dealer', none)).toBe(false)
    expect(isCompanyModuleBlockedPath('/expenses-other', none)).toBe(false)
    const both = { companyHasExpenses: true, companyHasClosingReports: true }
    expect(isCompanyModuleBlockedPath('/expenses', both)).toBe(false)
    expect(isCompanyModuleBlockedPath('/reports/window-tint-closing', both)).toBe(false)
    expect(isCompanyModuleBlockedPath('/reports/monthly-closing', both)).toBe(false)
    expect(isCompanyModuleBlockedPath('/reports/open-invoices', both)).toBe(false)
  })
})

describe('getVisibleNavigation', () => {
  const nav = (
    isDev: boolean,
    access: { expenses: boolean; monthly: boolean; tint: boolean },
    company: { companyHasExpenses: boolean; companyHasClosingReports: boolean },
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

  it('prod: sin el check de la empresa no aparecen Expenses ni los reportes de cierre', () => {
    // canAccess* ya vienen en false sin el módulo (payroll-access); el menú solo lista lo que recibe.
    const items = nav(
      false,
      { expenses: false, monthly: false, tint: false },
      { companyHasExpenses: false, companyHasClosingReports: false },
    )
    expect(items).not.toContain('/reports/monthly-closing')
    expect(items).not.toContain('/reports/window-tint-closing')
    expect(items.some((h) => h.startsWith('/expenses'))).toBe(false)
  })

  it('prod: con acceso aparecen los dos', () => {
    const items = nav(
      false,
      { expenses: true, monthly: true, tint: true },
      { companyHasExpenses: true, companyHasClosingReports: true },
    )
    expect(items).toEqual(expect.arrayContaining(['/expenses', '/expenses/recurring', '/reports/window-tint-closing']))
  })

  it('dev: muestra todo salvo los módulos que la empresa no tiene', () => {
    const gc = nav(
      true,
      { expenses: false, monthly: false, tint: false },
      { companyHasExpenses: true, companyHasClosingReports: false },
    )
    expect(gc).toContain('/expenses')
    expect(gc).toContain('/reports/business-kpis')
    expect(gc).not.toContain('/reports/monthly-closing')
    expect(gc).not.toContain('/reports/window-tint-closing')
    expect(gc).not.toContain('/reports/open-invoices')

    const mooi = nav(
      true,
      { expenses: false, monthly: false, tint: false },
      { companyHasExpenses: false, companyHasClosingReports: false },
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
 * Reports › Open Invoices (plans/plan-reporte-javier §4.3, §7.3): «Report Pro > Open Invoices» (153, antes 123) y el
 * módulo «Closing reports» abren el reporte y sus fotos. Un rol con SOLO 153 ve el menú y la pantalla en producción (no
 * «sin módulos»: hallazgo de la review 1).
 */
describe('Open Invoices (153)', () => {
  const autoWax = (over: Partial<SrsMeUser> = {}) => user({ hasWindowTintClosing: true, ...over })
  const only153 = { user: autoWax(), permissionIds: [ROL_ACCION_REPORT_OPEN_INVOICES] }
  const without = { user: autoWax(), permissionIds: [ROL_ACCION_TTK_ADMIN_HOURS] }

  it('un rol con solo 153 entra en producción, al reporte y a la comparación', () => {
    expect(getScreenAccess('/reports/open-invoices', only153, { isDev: false })).toBe('allowed')
    expect(getScreenAccess('/reports/open-invoices/snapshots/7', only153, { isDev: false })).toBe('allowed')
    expect(getScreenAccess('/reports/monthly-closing', only153, { isDev: false })).toBe('denied')
  })

  it('sin 153 no entra; Admin General y Admin Company sí (con el módulo)', () => {
    expect(getScreenAccess('/reports/open-invoices', without, { isDev: false })).toBe('denied')
    expect(canAccessOpenInvoices(autoWax(), none)).toBe(false)
    expect(canAccessOpenInvoices(autoWax({ isSystemAdmin: true }), none)).toBe(true)
  })

  it('el menú de un rol con solo 153 trae Reports › Open Invoices y nada más', () => {
    const items = getVisibleNavigation({
      isDev: false,
      canAccessTtk: false,
      canAccessOpenInvoices: true,
      companyModules: { companyHasExpenses: true, companyHasClosingReports: true },
      t,
    })
    expect(hrefs(items)).toEqual(['/reports/business-kpis', '/reports/open-invoices'])
  })

  it('sin 153 el menú no lo trae', () => {
    const items = getVisibleNavigation({
      isDev: false,
      canAccessTtk: true,
      companyModules: { companyHasExpenses: true, companyHasClosingReports: true },
      t,
    })
    expect(hrefs(items)).not.toContain('/reports/open-invoices')
  })

  it('isProdAllowedPath abre la ruta solo con la bandera de Open Invoices', () => {
    expect(isProdAllowedPath('/reports/open-invoices', false, false, false, false, false, false, false, false, false, false, true)).toBe(true)
    expect(isProdAllowedPath('/reports/open-invoices', false, false, false, false, false, false, false, false, false, false, false)).toBe(false)
  })
})

/**
 * Un permiso por reporte (tema 10 de plans/plan-reunion-juan-18-11, migration 033): un usuario que no es admin, de una
 * empresa con el módulo «Closing reports» (Auto Wax), con Punch Report para tener algún módulo.
 */
describe('un permiso por reporte (148–153)', () => {
  const REPORTS = {
    '/reports/business-kpis': ROL_ACCION_REPORT_BUSINESS_KPIS,
    '/reports/production-vs-goal': ROL_ACCION_REPORT_PRODUCTION_VS_GOAL,
    '/reports/income-by-dealer': ROL_ACCION_REPORT_INCOME_BY_DEALER,
    '/reports/monthly-closing': ROL_ACCION_REPORT_MONTHLY_CLOSING,
    '/reports/window-tint-closing': ROL_ACCION_REPORT_WINDOW_TINT_CLOSING,
    '/reports/open-invoices': ROL_ACCION_REPORT_OPEN_INVOICES,
  } as const
  const paths = Object.keys(REPORTS) as (keyof typeof REPORTS)[]
  const autoWax = (...ids: number[]) => ({
    user: user({ hasWindowTintClosing: true }),
    permissionIds: [ROL_ACCION_TTK_ADMIN_HOURS, ...ids],
  })

  it('sin ninguno de los seis: Access denied en los seis', () => {
    for (const path of paths) expect(getScreenAccess(path, autoWax(), { isDev: false }), path).toBe('denied')
  })

  it('los permisos del legacy (47, 93, 123 y 140) ya no abren ningún reporte de Pro', () => {
    for (const path of paths) expect(getScreenAccess(path, autoWax(47, 93, 123, 140), { isDev: false }), path).toBe('denied')
  })

  it.each(paths)('%s: su permiso lo abre a él solo', (path) => {
    const me = autoWax(REPORTS[path])
    for (const other of paths) {
      expect(getScreenAccess(other, me, { isDev: false }), ).toBe(other === path ? 'allowed' : 'denied')
    }
  })

  it('con solo Monthly Closing, el menú de Reports trae Monthly Closing y nada más de los seis', () => {
    const u = user({ hasWindowTintClosing: true })
    const has = granted(ROL_ACCION_REPORT_MONTHLY_CLOSING)
    const items = hrefs(
      getVisibleNavigation({
        isDev: false,
        canAccessTtk: true,
        canAccessMonthlyClosing: canAccessMonthlyClosing(u, has),
        canAccessWindowTintClosing: canAccessWindowTintClosing(u, has),
        canAccessOpenInvoices: canAccessOpenInvoices(u, has),
        companyModules: { companyHasExpenses: true, companyHasClosingReports: true },
        t,
      }),
    )
    expect(items.filter((h) => h.startsWith('/reports/') && h !== '/reports/business-kpis')).toEqual(['/reports/monthly-closing'])
  })

  it('la empresa sin el módulo: los tres de cierre dan «no-module», aun al admin; los otros tres abren', () => {
    const admin = { user: user({ isSystemAdmin: true, hasWindowTintClosing: false }), permissionIds: [] }
    for (const path of ['/reports/monthly-closing', '/reports/window-tint-closing', '/reports/open-invoices']) {
      expect(getScreenAccess(path, admin, { isDev: false }), path).toBe('no-module')
    }
    for (const path of ['/reports/business-kpis', '/reports/production-vs-goal', '/reports/income-by-dealer']) {
      expect(getScreenAccess(path, admin, { isDev: false }), path).toBe('allowed')
    }
  })
})
