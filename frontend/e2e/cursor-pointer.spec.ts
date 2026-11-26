/**
 * La manito en todo botón (plans/plan-buenas-practicas-v0, 5.4; `.cursor/rules/cursor-pointer-clickables.mdc`).
 * Solo en compu (en celular no hay puntero). Recorre todo `button` y `[role=button]` visible y habilitado del login y
 * de Dashboard, Invoices, Roles y Expenses, y falla si alguno no muestra la manito, salvo los que traen
 * `cursor-default` a propósito. Lista los que fallan.
 */
import { expect, test, type Page } from '@playwright/test'
import { E2E_MISSING_USER, E2E_MISSING_USER_REASON, login } from './helpers'

async function buttonsWithoutPointer(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = []
    for (const el of document.querySelectorAll<HTMLElement>('button, [role="button"]')) {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') continue
      if (el.closest('[aria-hidden="true"], [inert]')) continue
      // Un cursor puesto a propósito por la pantalla (no-permitido, «default» de un filtro que no se toca).
      if (el.classList.contains('cursor-default') || el.classList.contains('cursor-not-allowed')) continue
      const cursor = getComputedStyle(el).cursor
      if (cursor !== 'pointer') {
        const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 50)
        out.push(`${el.tagName.toLowerCase()} «${name}» → ${cursor}`)
      }
    }
    return out
  })
}

test.describe('Manito en todo botón', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'en celular no hay puntero')
  })

  test('login', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('#password')).toBeVisible()
    expect(await buttonsWithoutPointer(page)).toEqual([])
  })

  test('Dashboard, Invoices, WO to be Billed, Roles y Expenses', async ({ page }) => {
    test.skip(E2E_MISSING_USER, E2E_MISSING_USER_REASON)
    await login(page)
    for (const path of ['/', '/billing/invoices', '/billing/wo-to-be-billed', '/roles', '/expenses']) {
      await page.goto(path)
      await expect(page.locator('main')).toBeVisible()
      await page.waitForLoadState('networkidle').catch(() => {})
      await expect(page.getByTestId('content-skeleton')).toHaveCount(0)
      const missing = await buttonsWithoutPointer(page)
      expect(missing, `${path}: botones sin manito`).toEqual([])
    }
  })
})
