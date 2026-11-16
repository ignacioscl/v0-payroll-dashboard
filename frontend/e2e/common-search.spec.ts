/**
 * La X en todo buscador (plans/plan-buenas-practicas-v0, 5.1; regla global «Todo buscador tiene la X para borrar») y
 * el combo dentro del panel de filtros del celular (5.5). En compu y en celular, con E2E_USER y el Chromium de
 * Playwright.
 *
 * En cada buscador: se escribe, la X está **dentro** del campo y pegada a la derecha, el clic deja el campo vacío y con
 * el cursor, y no toca los demás filtros:
 * - el buscador de la tabla en Roles (`SearchInput`);
 * - el combo de dealers del encabezado (`CommandInput`): los dealers elegidos no cambian;
 * - el combo de empleado de Punch Report (`SearchableCombobox` sobre `CommandInput`);
 * - «Invoice #» en Invoices (`SearchInput`): el tipo elegido antes sigue elegido y habilitado.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import { E2E_MISSING_USER, E2E_MISSING_USER_REASON, login, pickAllDealersAndDatePreset } from './helpers'

/** La X está dentro de la caja del campo (o de su envoltorio) y contra su borde derecho. */
async function expectClearInside(field: Locator, clear: Locator) {
  const f = await field.boundingBox()
  const x = await clear.boundingBox()
  expect(f, 'campo visible').not.toBeNull()
  expect(x, 'X visible').not.toBeNull()
  if (!f || !x) return
  expect(x.x, 'la X arranca dentro del campo').toBeGreaterThanOrEqual(f.x)
  expect(x.x + x.width, 'la X termina dentro del campo').toBeLessThanOrEqual(f.x + f.width + 1)
  expect(x.y, 'la X no se sale por arriba').toBeGreaterThanOrEqual(f.y - 1)
  expect(x.y + x.height, 'la X no se sale por abajo').toBeLessThanOrEqual(f.y + f.height + 1)
  expect(f.x + f.width - (x.x + x.width), 'la X va pegada a la derecha').toBeLessThanOrEqual(16)
}

async function expectFocused(input: Locator) {
  expect(await input.evaluate((el) => el === document.activeElement), 'el cursor vuelve al campo').toBe(true)
}

/** El encabezado en compu; la hoja de filtros (abierta) en celular. */
async function headerScope(page: Page): Promise<Locator> {
  const openFilters = page.getByRole('button', { name: 'Open filters' })
  if (await openFilters.isVisible()) {
    await openFilters.click()
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    return sheet
  }
  return page.locator('header')
}

test.describe('La X en todo buscador', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(E2E_MISSING_USER, E2E_MISSING_USER_REASON)
    await login(page)
  })

  test('buscador de la tabla en Roles', async ({ page }) => {
    await page.goto('/roles')
    const input = page.locator('main input[type="search"]').first()
    await expect(input).toBeVisible()
    await input.fill('zz')
    const clear = input.locator('xpath=..').getByRole('button', { name: 'Clear search' })
    await expectClearInside(input, clear)
    await clear.click()
    await expect(input).toHaveValue('')
    await expectFocused(input)
    await expect(clear).toHaveCount(0)
  })

  test('combo de dealers del encabezado: borra la búsqueda y deja los dealers como estaban', async ({ page }) => {
    await page.goto('/issues')
    const scope = await headerScope(page)
    const trigger = scope.getByRole('combobox').filter({ hasText: /Dealer/ }).first()
    await expect(trigger).toBeVisible()
    const before = (await trigger.innerText()).trim()
    await trigger.click()
    const popover = page.locator('[data-slot="popover-content"]')
    const input = popover.locator('[cmdk-input]')
    await input.fill('zz')
    const wrapper = popover.locator('[data-slot="command-input-wrapper"]')
    const clear = wrapper.getByRole('button', { name: 'Clear search' })
    await expectClearInside(wrapper, clear)
    await clear.click()
    await expect(input).toHaveValue('')
    await expectFocused(input)
    await page.keyboard.press('Escape')
    await expect(popover).toHaveCount(0)
    expect((await trigger.innerText()).trim(), 'los dealers elegidos no cambian').toBe(before)
  })

  test('combo de empleado en Punch Report', async ({ page }) => {
    await page.goto('/issues')
    const scope = await headerScope(page)
    const trigger = scope.getByRole('combobox').filter({ hasText: /Employee/ }).first()
    await expect(trigger).toBeVisible()
    await expect(trigger).toBeEnabled()
    await trigger.click()
    const popover = page.locator('[data-slot="popover-content"]')
    const input = popover.locator('[cmdk-input]')
    await input.fill('zz')
    const wrapper = popover.locator('[data-slot="command-input-wrapper"]')
    const clear = wrapper.getByRole('button', { name: 'Clear search' })
    await expectClearInside(wrapper, clear)
    await clear.click()
    await expect(input).toHaveValue('')
    await expectFocused(input)
  })

  test('«Invoice #» en Invoices: borra el número y deja el tipo como estaba', async ({ page }) => {
    await page.goto('/billing/invoices')
    // Sin dealers elegidos los filtros de Invoices están deshabilitados.
    await pickAllDealersAndDatePreset(page, 'Last 30 days')
    const input = page.locator('#invoice-nro-search')
    if (!(await input.isVisible().catch(() => false))) {
      await page.locator('button[aria-expanded="false"]').filter({ hasText: 'Filters' }).first().click()
    }
    await expect(input).toBeVisible()
    const types = page.getByRole('group', { name: 'Invoice types' }).getByRole('button')
    // Se cambia Time Tracking para tener un filtro distinto del de arranque, y que quede habilitado (dos tipos prendidos).
    const ttk = types.filter({ hasText: 'Time Tracking' })
    await expect(ttk).toBeEnabled()
    await ttk.click()
    if ((await ttk.getAttribute('aria-pressed')) !== 'true') await ttk.click()
    await expect(ttk).toHaveAttribute('aria-pressed', 'true')
    await expect(ttk).toBeEnabled()
    const pressedBefore = await types.evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-pressed')))

    await input.fill('12345')
    const clear = input.locator('xpath=..').getByRole('button', { name: 'Clear search' })
    await expectClearInside(input, clear)
    await clear.click()
    await expect(input).toHaveValue('')
    await expectFocused(input)
    await expect(ttk).toBeEnabled()
    const pressedAfter = await types.evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-pressed')))
    expect(pressedAfter, 'el tipo elegido antes sigue elegido').toEqual(pressedBefore)
  })
})

test.describe('Panel de filtros del celular', () => {
  test('la lista de dealers se recorre con la rueda', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'el panel de filtros es del celular')
    test.skip(E2E_MISSING_USER, E2E_MISSING_USER_REASON)
    await login(page)
    await page.goto('/issues')
    const sheet = await headerScope(page)
    await sheet.getByRole('combobox').filter({ hasText: /Dealer/ }).first().click()
    const list = page.locator('[data-slot="popover-content"] [cmdk-list]')
    await expect(list).toBeVisible()
    const scrollable = await list.evaluate((el) => el.scrollHeight > el.clientHeight)
    test.skip(!scrollable, 'el usuario tiene pocos dealers: la lista no tiene scroll')
    const box = await list.boundingBox()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.wheel(0, 300)
    await expect.poll(() => list.evaluate((el) => el.scrollTop), { message: 'la lista se mueve' }).toBeGreaterThan(0)
  })
})
