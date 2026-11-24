/**
 * Un permiso por reporte (tema 10 de plans/plan-reunion-juan-18-11, migration 033) — el camino entero, en 375×812 y
 * 1280×800. Dos usuarios de `.env.e2e.local`:
 *
 * - E2E_USER: admin de Auto Wax; le cambia los permisos al rol del otro por la API de Roles, como Roles Admin.
 * - E2E_USER_REPORTS: de Auto Wax, NO admin, con un rol propio que solo tiene Punch Report (65). En la base local se
 *   crea y se borra con `plans/plan-reunion-juan-18-11/usuario-e2e-reportes.php`.
 *
 * Lo que recorre:
 * 1. Sin ninguno de los seis permisos «Report Pro > …»: la API de los seis reportes responde 403; con un build
 *    (E2E_BUILD=1) las seis pantallas por URL muestran «Access denied» dentro del marco y el menú no los trae. En
 *    `next dev` la pantalla no se prueba: el bypass de dev abre toda pantalla sin mirar el permiso (navigation.ts).
 * 2. Con solo «Report Pro > Monthly Closing» (151): la API de Monthly Closing deja pasar (el mes inválido da 400, no 403)
 *    y la de los otros cinco sigue en 403; con un build, entra a Monthly Closing y a ningún otro, y el menú de Reports
 *    trae solo ese.
 * Al final el rol queda con los permisos de reportes que tenía antes.
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import {
  E2E_MISSING_USER,
  E2E_MISSING_USER_REASON,
  E2E_MISSING_USER_REPORTS,
  E2E_MISSING_USER_REPORTS_REASON,
  E2E_PASSWORD_REPORTS,
  E2E_USER_REPORTS,
  login,
  noHorizontalScroll,
  openMobileMenuIfNeeded,
} from './helpers'

const BUILD = process.env.E2E_BUILD === '1'

const BUSINESS_KPIS = 148
const MONTHLY_CLOSING = 151
const REPORT_IDS = [148, 149, 150, 151, 152, 153]

const SCREENS = [
  { path: '/reports/business-kpis', menu: 'Business KPIs' },
  { path: '/reports/production-vs-goal', menu: 'Production vs Goal by Dealer' },
  { path: '/reports/income-by-dealer', menu: 'Income by Dealer' },
  { path: '/reports/monthly-closing', menu: 'Monthly Closing' },
  { path: '/reports/window-tint-closing', menu: 'Window Tint Closing' },
  { path: '/reports/open-invoices', menu: 'Open Invoices' },
] as const

const KPI_QUERY = 'fechaDesde=2026-10-01&fechaHasta=2026-10-31&idDealer=1'

/** Un endpoint de cada reporte (dos de Business KPIs: una tab de facturación y la de payroll). */
const API: { report: string; url: string }[] = [
  { report: 'Business KPIs', url: `/api/srs-kpis/kpis/billing?${KPI_QUERY}` },
  { report: 'Business KPIs', url: `/api/srs-kpis/kpis/payroll/spend?${KPI_QUERY}` },
  { report: 'Production vs Goal', url: `/api/srs-kpis/kpis/production/by-dealer?${KPI_QUERY}` },
  { report: 'Income by Dealer', url: `/api/srs-kpis/kpis/billing/income-by-dealer?${KPI_QUERY}` },
  { report: 'Monthly Closing', url: '/api/srs-kpis/reports/monthly-closing?month=bad&idDealer=1&scope=all' },
  { report: 'Window Tint Closing', url: '/api/srs-kpis/reports/monthly-closing?month=bad&idDealer=1&scope=tint' },
  { report: 'Open Invoices', url: '/api/srs-kpis/kpis/billing/open-invoices/snapshots?page=1&pageSize=10' },
]

async function setReportPermissions(admin: APIRequestContext, idRol: number, ids: number[], checked: boolean) {
  if (!ids.length) return
  const res = await admin.post(`/api/srs-kpis/roles/${idRol}/permissions`, { data: { idsRolAccion: ids, checked } })
  expect(res.ok(), `roles/${idRol}/permissions ${checked ? '+' : '-'}${ids.join(',')}: ${res.status()}`).toBe(true)
}

async function apiStatus(page: Page, url: string): Promise<number> {
  return (await page.request.get(url)).status()
}

async function reportsMenuLinks(page: Page): Promise<string[]> {
  await page.goto('/issues')
  await openMobileMenuIfNeeded(page)
  // El menú se arma cuando el marco ya tiene la sesión: «Punch Report» (el 65 del usuario) visible es la señal.
  await expect(page.getByRole('link', { name: 'Punch Report', exact: true })).toBeVisible()
  const reports = page.getByRole('button', { name: /^Reports$/ })
  // Sin ninguno de los seis (y sin otro reporte), el grupo Reports no se dibuja.
  if (!(await reports.isVisible().catch(() => false))) return []
  if (!(await page.getByRole('link', { name: 'Monthly Closing', exact: true }).isVisible().catch(() => false))) {
    await reports.click()
  }
  const visible: string[] = []
  for (const s of SCREENS) {
    if (await page.getByRole('link', { name: s.menu, exact: true }).isVisible().catch(() => false)) visible.push(s.path)
  }
  return visible
}

test.describe('un permiso por reporte', () => {
  test.skip(E2E_MISSING_USER, E2E_MISSING_USER_REASON)
  test.skip(E2E_MISSING_USER_REPORTS, E2E_MISSING_USER_REPORTS_REASON)

  test('sin los permisos no entra a ninguno; con el de Monthly Closing, solo a ese', async ({ page, browser }, testInfo) => {
    const adminContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL })
    const adminPage = await adminContext.newPage()
    await login(adminPage)

    await login(page, E2E_USER_REPORTS, E2E_PASSWORD_REPORTS)
    const me = await (await page.request.get('/api/auth/me')).json()
    expect(me.user.isSystemAdmin, 'E2E_USER_REPORTS no tiene que ser admin').toBe(false)
    const idRol = Number(me.user.idRolSystemV2)
    expect(idRol).toBeGreaterThan(0)
    const before = (me.permissionIds as number[]).filter((id) => REPORT_IDS.includes(id))

    try {
      // 1. Sin ninguno de los seis.
      await setReportPermissions(adminPage.request, idRol, REPORT_IDS, false)
      for (const { report, url } of API) expect(await apiStatus(page, url), `${report}: ${url}`).toBe(403)
      if (BUILD) {
        for (const { path } of SCREENS) {
          await page.goto(path)
          await expect(page.locator('main').getByText('Access denied'), path).toBeVisible()
          expect(new URL(page.url()).pathname).toBe(path)
        }
        expect(await reportsMenuLinks(page)).toEqual([])
        await noHorizontalScroll(page)
      }

      // 2. Solo Monthly Closing.
      await setReportPermissions(adminPage.request, idRol, [MONTHLY_CLOSING], true)
      for (const { report, url } of API) {
        // Monthly Closing pasa el permiso y el módulo de Auto Wax: el mes inválido es el 400 del servicio.
        expect(await apiStatus(page, url), `${report}: ${url}`).toBe(report === 'Monthly Closing' ? 400 : 403)
      }
      if (BUILD) {
        for (const { path } of SCREENS) {
          await page.goto(path)
          const denied = page.locator('main').getByText('Access denied')
          if (path === '/reports/monthly-closing') {
            await expect(page.getByRole('heading', { name: 'Monthly Closing' })).toBeVisible()
            await expect(denied).toHaveCount(0)
          } else {
            await expect(denied, path).toBeVisible()
          }
        }
        expect(await reportsMenuLinks(page)).toEqual(['/reports/monthly-closing'])
        await noHorizontalScroll(page)
      }

      // Business KPIs no lo abre ningún permiso del legacy: el 148 sí (todas sus tabs, también Payroll Spend).
      await setReportPermissions(adminPage.request, idRol, [BUSINESS_KPIS], true)
      expect(await apiStatus(page, `/api/srs-kpis/kpis/payroll/spend?${KPI_QUERY}`)).not.toBe(403)
    } finally {
      await setReportPermissions(adminPage.request, idRol, REPORT_IDS, false)
      await setReportPermissions(adminPage.request, idRol, before, true)
      await adminContext.close()
    }
  })
})

/**
 * Billing › WO to be Billed (plans/plan-wo-to-be-billed-v0, T11): un usuario sin «Invoices > Create Invoice» ve «Access
 * denied» dentro del marco y no tiene el ítem en el menú. Las rutas de la API (403) están en wo-to-be-billed.spec.ts.
 */
test.describe('WO to be Billed sin «Create Invoice»', () => {
  test.skip(E2E_MISSING_USER_REPORTS, E2E_MISSING_USER_REPORTS_REASON)
  test.skip(!BUILD, 'Access denied only shows on a build (E2E_BUILD=1): next dev opens every screen')

  test('«Access denied» dentro del marco y sin el ítem del menú', async ({ page }) => {
    await login(page, E2E_USER_REPORTS, E2E_PASSWORD_REPORTS)
    await page.goto('/billing/wo-to-be-billed')
    await expect(page.locator('main').getByText('Access denied')).toBeVisible()
    expect(new URL(page.url()).pathname).toBe('/billing/wo-to-be-billed')
    await openMobileMenuIfNeeded(page)
    await expect(page.getByRole('link', { name: 'WO to be Billed', exact: true })).toHaveCount(0)
    await noHorizontalScroll(page)
  })
})
