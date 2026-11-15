/**
 * Tarjetas y filas que llevan a otra pantalla son enlace (plans/plan-buenas-practicas-v0, 4.4, prueba P8b), en
 * 1280×800 y 375×812 (los dos proyectos de playwright.config.ts). Contra http://pro.srs.com local, con el usuario de
 * `.env.e2e.local`.
 *
 * Se hace clic **en el cuerpo** de la caja (el ícono de la tarjeta, una celda de números de la fila), no en el título
 * ni en la celda del enlace, que son el `<Link>` y andan solos:
 * - clic normal → navega en la misma pestaña con los filtros puestos (Dashboard: `/issues` con el tipo de la tarjeta
 *   marcado; Analytics: `/expenses` con la categoría de la fila);
 * - Ctrl/Cmd + clic y el botón del medio → se abre otra pestaña y la actual no cambia de dirección ni de filtros (D12:
 *   en Dashboard la otra pestaña abre sin los filtros del clic; en Analytics los lleva en la dirección).
 *
 * En celular se saltean Ctrl/Cmd y el botón del medio: un teléfono no tiene teclado con modificadores ni botón del
 * medio; abrir en otra pestaña es el menú del navegador al mantener apretado el enlace, que es nativo.
 *
 * Analytics necesita al menos una categoría con gastos en «Last Month» o «Last 30 days» con All Dealers; si no hay, ese
 * caso se saltea con el motivo.
 */
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { E2E_MISSING_USER, E2E_MISSING_USER_REASON, login, pickAllDealersAndDatePreset } from './helpers'

test.skip(E2E_MISSING_USER, E2E_MISSING_USER_REASON)

const NO_MODIFIERS_ON_PHONE =
  'A phone has no Ctrl/Cmd nor middle button; opening in another tab is the native long-press menu of the link'

/** La tarjeta del Dashboard cuyo título (el enlace) es `title`. */
function dashboardCard(page: Page, title: string): Locator {
  return page
    .locator('[data-slot="kpi-card"]')
    .filter({ has: page.locator('a[data-card-link]', { hasText: new RegExp(`^${title}$`) }) })
}

/** El cuerpo de la tarjeta: el ícono, que no es ni el título ni un botón. */
function cardBody(card: Locator): Locator {
  return card.locator('svg').first()
}

/** La tarjeta de filtro de Punch Report («All punches» / «Only flagged») está marcada o no. */
async function expectShowFilter(page: Page, pressed: 'All punches' | 'Only flagged') {
  const other = pressed === 'All punches' ? 'Only flagged' : 'All punches'
  await expect(page.locator('[role="button"][aria-pressed]').filter({ hasText: pressed }).first()).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.locator('[role="button"][aria-pressed]').filter({ hasText: other }).first()).toHaveAttribute(
    'aria-pressed',
    'false',
  )
}

/** Hace `act` y devuelve la pestaña nueva que abre, ya cargada. */
async function newTabFrom(context: BrowserContext, act: () => Promise<void>): Promise<Page> {
  const [popup] = await Promise.all([context.waitForEvent('page'), act()])
  await popup.waitForLoadState('domcontentloaded')
  return popup
}

test.describe('Dashboard cards are links', () => {
  /**
   * Deja la pestaña en Punch Report con «All punches» marcado (clic normal en el cuerpo de Total punches) y vuelve al
   * Dashboard sin recargar (los filtros viven en memoria y la vuelta atrás no recarga el documento).
   */
  async function startWithAllPunches(page: Page) {
    await login(page)
    await page.goto('/')
    const total = dashboardCard(page, 'Total punches')
    await expect(total).toBeVisible()
    await cardBody(total).click()
    await expect(page).toHaveURL(/\/issues$/)
    await expectShowFilter(page, 'All punches')
    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
    await expect(dashboardCard(page, 'Error rate')).toBeVisible()
  }

  test('plain click on the body navigates in the same tab with the type of the card', async ({ page }) => {
    await startWithAllPunches(page)
    // Otra tarjeta, otro tipo: el clic fija «Only flagged» (no era el que había).
    await cardBody(dashboardCard(page, 'Error rate')).click()
    await expect(page).toHaveURL(/\/issues$/)
    await expectShowFilter(page, 'Only flagged')
  })

  for (const how of ['ControlOrMeta', 'middle'] as const) {
    test(`${how} click on the body opens another tab; this one keeps its address and filters`, async ({
      page,
      context,
      isMobile,
    }) => {
      test.skip(isMobile, NO_MODIFIERS_ON_PHONE)
      await startWithAllPunches(page)
      const body = cardBody(dashboardCard(page, 'Error rate'))
      const popup = await newTabFrom(context, () =>
        how === 'middle' ? body.click({ button: 'middle' }) : body.click({ modifiers: ['ControlOrMeta'] }),
      )
      await expect(popup).toHaveURL(/\/issues$/)
      await popup.close()

      await expect(page).toHaveURL(/\/$/)
      // Los filtros de la pestaña actual no cambiaron: Punch Report sigue en «All punches» (el clic no corrió su
      // `onNavigate`, que habría puesto «Only flagged»).
      await page.goForward()
      await expect(page).toHaveURL(/\/issues$/)
      await expectShowFilter(page, 'All punches')
    })
  }
})

test.describe('Analytics rows are links', () => {
  /** Analytics con All Dealers y el primer atajo que traiga una categoría; la fila y su nombre. */
  async function openAnalyticsRow(page: Page): Promise<{ row: Locator; name: string } | null> {
    await login(page)
    await page.goto('/expenses/analytics')
    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible()
    for (const preset of ['Last Month', 'Last 30 days']) {
      await pickAllDealersAndDatePreset(page, preset)
      const link = page.locator('a[data-row-link]').first()
      const found = await link
        .waitFor({ state: 'visible', timeout: 15_000 })
        .then(() => true)
        .catch(() => false)
      if (!found) continue
      const name = (await link.innerText()).trim()
      const row = link.locator('xpath=ancestor::tr[1]')
      return { row, name }
    }
    return null
  }

  /** El cuerpo de la fila: la celda del Total (no la del enlace). */
  function rowBody(row: Locator): Locator {
    return row.getByRole('cell').nth(2)
  }

  test('plain click on the body opens the list with the category of the row', async ({ page }) => {
    const target = await openAnalyticsRow(page)
    test.skip(!target, 'No expenses in «Last Month» nor «Last 30 days» with All Dealers in the local database')
    const { row, name } = target!
    await rowBody(row).click()
    await expect(page).toHaveURL(/\/expenses(\?|$)/)
    await expect(page.getByRole('heading', { name: 'Expenses List' })).toBeVisible()
    await expect(page.getByText(`Category: ${name}`).first()).toBeVisible()
  })

  for (const how of ['ControlOrMeta', 'middle'] as const) {
    test(`${how} click on the body opens the list in another tab; this one stays in Analytics`, async ({
      page,
      context,
      isMobile,
    }) => {
      test.skip(isMobile, NO_MODIFIERS_ON_PHONE)
      const target = await openAnalyticsRow(page)
      test.skip(!target, 'No expenses in «Last Month» nor «Last 30 days» with All Dealers in the local database')
      const { row, name } = target!
      const body = rowBody(row)
      const popup = await newTabFrom(context, () =>
        how === 'middle' ? body.click({ button: 'middle' }) : body.click({ modifiers: ['ControlOrMeta'] }),
      )
      // Acá los filtros viajan en la dirección: la otra pestaña también llega con la categoría.
      await expect(popup).toHaveURL(/\/expenses(\?|$)/)
      await expect(popup.getByText(`Category: ${name}`).first()).toBeVisible()
      await popup.close()

      await expect(page).toHaveURL(/\/expenses\/analytics$/)
      await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible()
      await expect(row).toBeVisible()
    })
  }
})
