/**
 * Las pantallas de lista se ven iguales (regla global «No se inventa diseño»), en 1280×800 y 375×812. Mide en el
 * navegador las mismas piezas de una pantalla de referencia (Invoices) y de las que la siguen, y falla si algo cambia
 * de letra, tamaño o forma: título, «What this list counts», panel de filtros, tarjetas de total, contador, títulos de
 * columna, celdas y el menú de acciones de la fila.
 *
 * 24/11/2026: WO to be Billed salió con los títulos de columna en otra letra, el total metido en el contador, las
 * acciones como íconos sueltos y sin «Rows» ni «Columns»; ninguna prueba lo veía porque cada pantalla pasaba las suyas.
 */
import { expect, test, type Page } from '@playwright/test'
import { E2E_MISSING_USER, E2E_MISSING_USER_REASON, login, pickDealerAndRange } from './helpers'

test.skip(E2E_MISSING_USER, E2E_MISSING_USER_REASON)

const DEALER = 'Tesla Orange Park Mall Pop-Up'
const REFERENCE = { path: '/billing/invoices', from: '10/01/2026', to: '10/31/2026' }
const SCREENS = [{ path: '/billing/wo-to-be-billed', from: '11/10/2026', to: '11/10/2026' }]

type Style = { fs: string; fw: string; tt: string; ls: string; color: string } | null

async function measure(page: Page) {
  // Se espera la tabla con filas para medir celdas.
  await expect(page.locator('main tbody tr td').nth(2)).toBeVisible({ timeout: 60_000 })
  return page.evaluate(() => {
    const st = (el: Element | null | undefined): Style => {
      if (!el) return null
      const s = getComputedStyle(el)
      return { fs: s.fontSize, fw: s.fontWeight, tt: s.textTransform, ls: s.letterSpacing, color: s.color }
    }
    const main = document.querySelector('main')!
    const all = [...main.querySelectorAll('*')] as HTMLElement[]
    const leaf = (re: RegExp) => all.find((e) => e.children.length === 0 && re.test(e.innerText ?? ''))
    const th = main.querySelectorAll('thead th')[2]
    return {
      title: st(main.querySelector('h1')),
      subtitle: st(main.querySelector('h1')?.parentElement?.parentElement?.querySelector('p')),
      rulesLink: st(leaf(/^What this list counts$/)),
      filters: st(leaf(/^Filters$/)),
      tileLabel: st(main.querySelector('[class*="grid-cols-2"] p')),
      counterNumber: st(all.find((e) => /^\d[\d,]*$/.test(e.innerText ?? '') && e.children.length === 0 && !e.closest('table') && !e.closest('[class*="grid-cols-2"]'))),
      columnTitle: st(th?.querySelector('span, div') ?? th),
      cell: st(main.querySelectorAll('tbody tr:first-child td')[3]),
      rowActions: Boolean(main.querySelector('tbody tr:first-child button[aria-label="Actions"]')),
      rows: Boolean(leaf(/^Rows$/)),
      columns: Boolean(all.find((e) => e.tagName === 'BUTTON' && /^Columns/.test(e.innerText ?? ''))),
    }
  })
}

test('las pantallas de lista de Billing se ven como Invoices', async ({ page }) => {
  await login(page)
  await page.goto(REFERENCE.path)
  await pickDealerAndRange(page, DEALER, REFERENCE.from, REFERENCE.to)
  const reference = await measure(page)
  expect(reference.rowActions && reference.rows && reference.columns, 'the reference has the usual toolbar and menu').toBe(true)

  for (const screen of SCREENS) {
    await page.goto(screen.path)
    await pickDealerAndRange(page, DEALER, screen.from, screen.to)
    const got = await measure(page)
    expect(got, `${screen.path} looks different from ${REFERENCE.path}`).toEqual(reference)
  }
})
