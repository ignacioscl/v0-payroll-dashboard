/**
 * Tablas en celular: nada fijo y nada cortado (plans/plan-buenas-practicas-v0, 5.2; regla global «Tablas en celular»
 * y `.cursor/rules/data-table.mdc`). Con E2E_USER y el Chromium de Playwright.
 *
 * - Celular (375 px), en Invoices, Dashboard, Production vs Goal y Role Templates: ninguna celda queda fija de
 *   costado (`position: sticky` con `left`/`right`; arriba sí puede) y ningún texto de la tabla se corta con «…».
 * - Compu: Invoices sigue con su columna Invoice # fija, así no se rompe la compu.
 */
import { expect, test, type Page } from '@playwright/test'
import { E2E_MISSING_USER, E2E_MISSING_USER_REASON, login, pickAllDealersAndDatePreset, pickDealerAndRange } from './helpers'

const PAGES = ['/billing/invoices', '/billing/wo-to-be-billed', '/', '/reports/production-vs-goal', '/roles/templates']

async function tableProblems(page: Page) {
  return page.evaluate(() => {
    const pinned: string[] = []
    const cut: string[] = []
    for (const cell of document.querySelectorAll<HTMLElement>('table td, table th')) {
      const s = getComputedStyle(cell)
      if (s.position === 'sticky' && (s.left !== 'auto' || s.right !== 'auto')) {
        pinned.push((cell.textContent ?? '').trim().slice(0, 40) || cell.tagName)
      }
    }
    for (const el of document.querySelectorAll<HTMLElement>('table td, table td *')) {
      if (el.clientWidth === 0) continue
      const s = getComputedStyle(el)
      if (s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) {
        cut.push((el.textContent ?? '').trim().slice(0, 40))
      }
    }
    return { pinned: [...new Set(pinned)].slice(0, 10), cut: [...new Set(cut)].slice(0, 10) }
  })
}

async function waitForTables(page: Page) {
  await expect(page.locator('main')).toBeVisible()
  await expect(page.getByTestId('content-skeleton')).toHaveCount(0)
  await page.waitForLoadState('networkidle').catch(() => {})
  await expect(page.locator('main table').first()).toBeVisible()
}

test.describe('Tablas en celular', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(E2E_MISSING_USER, E2E_MISSING_USER_REASON)
    await login(page)
  })

  test('nada fijo de costado y nada cortado con «…»', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'es la vista de celular')
    for (const path of PAGES) {
      await page.goto(path)
      // Con todos los dealers y un mes, para que las tablas tengan filas (los filtros no se guardan entre pantallas).
      // WO to be Billed es de a un dealer.
      if (path === '/billing/wo-to-be-billed') await pickDealerAndRange(page, 'Tesla Orange Park Mall Pop-Up', '11/10/2026')
      else if (path !== '/roles/templates') await pickAllDealersAndDatePreset(page, 'Last 30 days')
      await waitForTables(page)
      const rows = page.locator('main table tbody tr')
      // Invoices con un mes de todos los dealers tiene filas: si no, el control no probaría nada.
      if (path === '/billing/invoices') {
        await expect.poll(() => rows.count(), { message: 'Invoices con filas', timeout: 45_000 }).toBeGreaterThan(1)
      }
      testInfo.annotations.push({ type: 'filas', description: `${path}: ${await rows.count()}` })
      const problems = await tableProblems(page)
      expect(problems, `${path}: columnas fijas o texto cortado`).toEqual({ pinned: [], cut: [] })
    }
  })

  test('en la compu Invoices sigue con su columna fija', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'es la vista de compu')
    await page.goto('/billing/invoices')
    await waitForTables(page)
    const pinnedLeft = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('table th')].filter((th) => {
        const s = getComputedStyle(th)
        return s.position === 'sticky' && s.left !== 'auto'
      }).length,
    )
    expect(pinnedLeft, 'columnas fijas a la izquierda en la compu').toBeGreaterThan(0)
  })
})
