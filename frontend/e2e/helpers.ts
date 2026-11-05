/**
 * Lo común de los e2e de SRS Suite Pro: el usuario de `.env.e2e.local` (E2E_USER / E2E_PASSWORD), el login y
 * los chequeos de pantalla que repiten todos los caminos.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, type Page } from '@playwright/test'

function loadEnv(): Record<string, string> {
  const file = resolve(__dirname, '../.env.e2e.local')
  if (!existsSync(file)) return {}
  const out: Record<string, string> = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const env = { ...loadEnv(), ...process.env }
export const E2E_USER = env.E2E_USER ?? ''
export const E2E_PASSWORD = env.E2E_PASSWORD ?? ''
export const E2E_MISSING_USER = !E2E_USER || !E2E_PASSWORD
export const E2E_MISSING_USER_REASON = 'Set E2E_USER and E2E_PASSWORD in frontend/.env.e2e.local'

export async function login(page: Page) {
  await page.goto('/login')
  await page.locator('#email').fill(E2E_USER)
  await page.locator('#password').fill(E2E_PASSWORD)
  await page.getByRole('button', { name: /sign in|log in|ingresar|entrar/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}

export async function noHorizontalScroll(page: Page) {
  const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  expect(ok, 'page must not scroll horizontally').toBe(true)
}

export async function openMobileMenuIfNeeded(page: Page) {
  const burger = page.getByRole('button', { name: /open menu|abrir men/i })
  if (await burger.isVisible().catch(() => false)) await burger.click()
}
