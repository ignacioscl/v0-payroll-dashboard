/**
 * Cambiar de pantalla es instantáneo (plans/plan-buenas-practicas-v0, 4.8, P3 y P6; regla global y
 * `.cursor/rules/navigation.mdc`). En 1280×800 y 375×812 (los dos proyectos de playwright.config.ts), con E2E_USER.
 *
 * - Siempre: cada enlace del menú cambia la pantalla **sin pedir un documento nuevo** y sin volver a montar el marco.
 * - Solo contra un build (`E2E_BUILD=1`; en `next dev` no hay precarga): con las respuestas RSC retrasadas 1,5 s, el
 *   esqueleto del contenido aparece antes de 300 ms, también entre pantallas hermanas; y una pantalla solo de dev
 *   (`/components`) muestra «Access denied» dentro del marco, con el menú y la dirección igual.
 * La tarjeta del Dashboard y la fila de Analytics como enlace (P8b) están en `box-links.spec.ts`.
 */
import { expect, test, type Page } from '@playwright/test'
import { E2E_MISSING_USER, E2E_MISSING_USER_REASON, login, openMobileMenuIfNeeded } from './helpers'


const BUILD = process.env.E2E_BUILD === '1'

/** Donde están los enlaces del menú: el `<aside>` en compu, la hoja lateral en celular. */
function menu(page: Page, isMobile: boolean) {
  return isMobile ? page.getByRole('dialog') : page.locator('aside')
}

async function openMenu(page: Page, isMobile: boolean) {
  if (isMobile) {
    // La hoja tiene animación: se espera que esté abierta del todo (y, al navegar, cerrada) antes de seguir.
    const sheet = page.getByRole('dialog')
    if (!(await sheet.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: /open menu|abrir men/i }).click()
      await expect(sheet).toBeVisible()
    }
  } else if (!(await page.locator('aside nav a[href="/issues"] span').first().isVisible().catch(() => false))) {
    await openMobileMenuIfNeeded(page) // agranda el menú si arrancó en íconos
  }
}

/** Todos los enlaces internos del menú, abriendo cada grupo. */
async function menuHrefs(page: Page, isMobile: boolean): Promise<string[]> {
  await openMenu(page, isMobile)
  const root = menu(page, isMobile)
  const hrefs = new Set<string>()
  const collect = async () => {
    for (const h of await root.locator('nav a[href^="/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''))) {
      if (h) hrefs.add(h)
    }
  }
  await collect()
  const groups = root.locator('nav button[aria-expanded]')
  for (let i = 0; i < (await groups.count()); i++) {
    if ((await groups.nth(i).getAttribute('aria-expanded')) === 'false') await groups.nth(i).click()
    await collect()
  }
  if (isMobile) {
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
  }
  return [...hrefs]
}

async function clickMenuLink(page: Page, isMobile: boolean, href: string) {
  await openMenu(page, isMobile)
  const root = menu(page, isMobile)
  const link = root.locator(`nav a[href="${href}"]`).first()
  if (!(await link.isVisible().catch(() => false))) {
    const groups = root.locator('nav button[aria-expanded="false"]')
    for (let i = 0; i < (await groups.count()) && !(await link.isVisible().catch(() => false)); i++) {
      await groups.nth(i).click()
    }
  }
  await link.click()
}

async function markFrame(page: Page) {
  await page.locator('aside').first().evaluate((el) => el.setAttribute('data-e2e-frame', 'same'))
}

test.describe('navegación del panel', () => {
  test.skip(E2E_MISSING_USER, E2E_MISSING_USER_REASON)

  test('cada enlace del menú cambia la pantalla sin pedir un documento ni volver a montar el marco', async ({ page, isMobile }) => {
    await login(page)
    await page.goto('/issues')
    await expect(page.locator('main')).toBeVisible()
    const hrefs = await menuHrefs(page, isMobile)
    expect(hrefs.length).toBeGreaterThan(3)

    let documents = 0
    page.on('request', (r) => {
      if (r.resourceType() === 'document' && r.frame() === page.mainFrame()) documents += 1
    })
    await markFrame(page)

    for (const href of hrefs) {
      if (new URL(page.url()).pathname === href) continue
      await clickMenuLink(page, isMobile, href)
      await page.waitForURL((url) => url.pathname === href)
      if (isMobile) await expect(page.getByRole('dialog')).toBeHidden()
      expect(documents, `${href}: se pidió un documento nuevo (recargó la página)`).toBe(0)
      await expect(page.locator('aside[data-e2e-frame="same"]'), `${href}: el marco se volvió a montar`).toHaveCount(1)
    }
  })
})

test.describe('sobre el build', () => {
  test.skip(E2E_MISSING_USER, E2E_MISSING_USER_REASON)
  test.skip(!BUILD, 'Solo contra `next build && next start` (E2E_BUILD=1): en next dev no hay precarga')

  const PAIRS: [string, string][] = [
    ['/issues', '/billing/invoices'],
    ['/reports/business-kpis', '/reports/production-vs-goal'],
    ['/expenses', '/expenses/analytics'],
    ['/roles', '/roles/templates'],
  ]

  for (const [from, to] of PAIRS) {
    test(`${from} → ${to}: el esqueleto aparece antes de 300 ms`, async ({ page, isMobile }) => {
      await login(page)
      await page.goto(from)
      await expect(page.locator('main')).toBeVisible()
      // Retrasa las respuestas RSC de la navegación (no las precargas) para que se vea lo que pasa en el medio.
      await page.route('**/*', async (route) => {
        const h = route.request().headers()
        if (h.rsc === '1' && !h['next-router-prefetch']) await new Promise((r) => setTimeout(r, 1500))
        await route.continue()
      })
      await page.waitForTimeout(1000) // deja que el menú precargue
      const start = Date.now()
      await clickMenuLink(page, isMobile, to)
      await expect(page.getByTestId('content-skeleton').first()).toBeVisible({ timeout: 1000 })
      expect(Date.now() - start, 'el esqueleto tardó').toBeLessThan(300 + 150) // 150 ms de margen del propio clic
      await page.waitForURL((url) => url.pathname === to)
    })
  }

  test('pantalla sin permiso: «Access denied» dentro del marco, con el menú y la dirección igual', async ({ page }) => {
    await login(page)
    await page.goto('/components')
    await expect(page.locator('main').getByText('Access denied')).toBeVisible()
    await expect(page.locator('main').getByText('You do not have access to this screen with your current role.')).toBeVisible()
    expect(new URL(page.url()).pathname).toBe('/components')
    await expect(page.locator('header')).toBeVisible()
  })
})
