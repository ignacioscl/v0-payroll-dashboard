/**
 * Expenses › Settings — el camino entero de plans/plan-expenses-settings (§2.5, §10), en 375×812 y 1280×800 (los
 * dos proyectos de playwright.config.ts, Chromium de Playwright). Contra http://pro.srs.com local, con el usuario de
 * Auto Wax de `.env.e2e.local`.
 *
 * Lo que recorre: un gasto con una compañía nueva («Dup», creado por la API) → Settings abre solo con activas; Delete de «Dup» está
 * deshabilitado (tiene un gasto) → «⋯ › Merge into…» la unifica con «Keep» (resumen, confirmación) y desaparece →
 * «Keep» cuenta el gasto y el gasto dice «Keep» → una compañía vacía se desactiva, sale de la vista, aparece con «Show
 * inactive» y se borra con confirmación → Add con el nombre de una inactiva la reactiva y cierra con éxito. Al final
 * borra el gasto y desactiva lo creado. Sin scroll horizontal de la página en 375.
 */
import { expect, test, type Page } from '@playwright/test'
import { E2E_MISSING_USER, E2E_MISSING_USER_REASON, E2E_PASSWORD, E2E_USER, noHorizontalScroll } from './helpers'

/**
 * El login del helper, con reintento: en `next dev` la primera compilación de una página recarga /login justo
 * después de escribir (Fast Refresh) y el envío se pierde. Si a los 15 s sigue en /login, se vuelve a intentar.
 */
async function login(page: Page) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.goto('/login')
    await page.locator('#email').fill(E2E_USER)
    await page.locator('#password').fill(E2E_PASSWORD)
    await page.getByRole('button', { name: /sign in/i }).click()
    const left = await page
      .waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 })
      .then(() => true)
      .catch(() => false)
    if (left) return
  }
  throw new Error('login did not leave /login after 4 attempts')
}

const STAMP = `e2e-set-${Date.now()}`
const DUP = `${STAMP} Dup Co`
const KEEP = `${STAMP} Keep Co`
const EMPTY = `${STAMP} Empty Co`
const REACT = `${STAMP} React Co`
const CATEGORY = `${STAMP} Cat`
const DESCRIPTION = `${STAMP} merge`
const SIMILAR_ACTIVE = `${STAMP} ABC Co`
const SIMILAR_INACTIVE = `${STAMP} A.B.C Co`

test.skip(E2E_MISSING_USER, E2E_MISSING_USER_REASON)

async function pickCombobox(page: Page, fieldName: string, text: string, create = false) {
  const field = page.locator(`[data-field="${fieldName}"]`)
  await field.getByRole('combobox').click()
  const input = page.locator('[cmdk-input]').last()
  await input.fill(text)
  if (create) {
    await page.getByRole('option', { name: `Create "${text}"` }).click()
  } else {
    await page.getByRole('option', { name: new RegExp(text, 'i') }).first().click()
  }
}

async function openCompanies(page: Page) {
  await page.goto('/expenses/settings')
  await page.getByRole('tab', { name: 'Companies' }).click()
}

async function search(page: Page, text: string) {
  await page.getByPlaceholder(/search/i).fill(text)
}

const rowOf = (page: Page, text: string) => page.getByRole('row').filter({ hasText: text }).first()

async function addCompany(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add company' }).click()
  await page.locator('#settings-item-name').fill(name)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Settings saved.').first()).toBeVisible()
  await expect(page.locator('#settings-item-name')).toBeHidden()
}

async function deactivate(page: Page, name: string) {
  await search(page, name)
  await rowOf(page, name).getByRole('switch').click()
  await page.getByRole('button', { name: 'Yes, change it' }).click()
  await expect(rowOf(page, name)).toBeHidden()
}

test.describe.serial('Expenses Settings — delete, show inactive, merge, reactivate', () => {
  let expenseId = 0

  // Preparación: el gasto se crea por la API con la sesión del navegador (el alta de gastos tiene su propio e2e,
  // expenses.spec.ts); lo que se prueba acá es Settings.
  test('setup: an expense with a new company («Dup»)', async ({ page }) => {
    await login(page)
    const dealersRes = await page.request.get('/api/dealers')
    expect(dealersRes.ok()).toBe(true)
    const raw = await dealersRes.json()
    const list: { id?: unknown }[] = Array.isArray(raw) ? raw : (raw.data ?? raw.dealers ?? [])
    const idDealer = Number(list[0]?.id)
    expect(idDealer).toBeGreaterThan(0)
    const res = await page.request.post('/api/srs-kpis/expenses', {
      data: {
        ticketDate: new Date().toISOString().slice(0, 10),
        newCompanyName: DUP,
        newCategoryName: CATEGORY,
        mode: 'single',
        idDealer,
        totalAmount: '12.34',
        description: DESCRIPTION,
      },
    })
    expect(res.ok(), await res.text()).toBe(true)
    expenseId = Number((await res.json()).id)
    expect(expenseId).toBeGreaterThan(0)
  })

  test('Merge «Dup» into «Keep»: Delete is disabled, the summary counts the expense, the row goes away', async ({ page }) => {
    await login(page)
    await openCompanies(page)
    await addCompany(page, KEEP)
    await search(page, STAMP)
    await expect(rowOf(page, DUP)).toBeVisible()
    await expect(rowOf(page, KEEP)).toBeVisible()
    await noHorizontalScroll(page)

    await rowOf(page, DUP).getByRole('button', { name: 'Actions' }).click()
    await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeDisabled()
    await page.getByRole('menuitem', { name: 'Merge into…' }).click()
    // Cada nombre va con su cantidad de gastos: así se distinguen dos que se llaman igual (11/11/2026).
    await expect(page.getByRole('heading', { name: `Merge "${DUP} (1 expense(s))" into…` })).toBeVisible()

    // Sin elegir: el error queda en el campo y con el foco.
    await page.getByRole('button', { name: 'Merge', exact: true }).click()
    await expect(page.getByText('Choose a company.')).toBeVisible()
    const combo = page.locator('[data-field="target"] [role="combobox"]')
    await expect(combo).toBeFocused()
    await expect(combo).toBeInViewport()

    await pickCombobox(page, 'target', KEEP)
    await expect(
      page.getByText(`1 expense(s) (0 deleted) and 0 recurring rule(s) will move to "${KEEP} (0 expense(s))".`),
    ).toBeVisible()
    await expect(page.getByText(`"${DUP} (1 expense(s))" will be deleted.`)).toBeVisible()
    await noHorizontalScroll(page)
    await page.getByRole('button', { name: 'Merge', exact: true }).click()
    await expect(page.getByText(`Merge "${DUP} (1 expense(s))" into "${KEEP} (0 expense(s))"?`)).toBeVisible()
    await page.getByRole('button', { name: 'Yes, merge' }).click()
    await expect(page.getByText('Merged: 1 expense(s) moved.')).toBeVisible()
    await expect(rowOf(page, DUP)).toBeHidden()
    await expect(rowOf(page, KEEP)).toBeVisible()
  })

  test('the expense moved to «Keep»: its Expenses column counts it and the expense says «Keep»', async ({ page }) => {
    await login(page)
    await openCompanies(page)
    await search(page, KEEP)
    await expect(rowOf(page, KEEP).getByRole('cell').nth(1)).toHaveText('1')
    const detail = await (await page.request.get(`/api/srs-kpis/expenses/${expenseId}`)).json()
    expect(JSON.stringify(detail)).toContain(KEEP)
  })

  test('a deactivated company leaves the list, shows up with «Show inactive» and is deleted with confirmation', async ({ page }) => {
    await login(page)
    await openCompanies(page)
    await addCompany(page, EMPTY)
    await deactivate(page, EMPTY)

    await page.getByRole('switch', { name: 'Show inactive' }).click()
    await search(page, EMPTY)
    const row = rowOf(page, EMPTY)
    await expect(row).toBeVisible()
    await noHorizontalScroll(page)
    await row.getByRole('button', { name: 'Actions' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await expect(page.getByText(`Delete "${EMPTY}"?`)).toBeVisible()
    await page.getByRole('button', { name: 'Yes, delete it' }).click()
    await expect(page.getByText('Deleted.', { exact: true })).toBeVisible()
    await expect(row).toBeHidden()
  })

  test('Add with the name of an inactive company reactivates it and closes as saved', async ({ page }) => {
    await login(page)
    await openCompanies(page)
    await addCompany(page, REACT)
    await deactivate(page, REACT)
    await addCompany(page, REACT.toLowerCase())
    await search(page, REACT)
    await expect(rowOf(page, REACT)).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: new RegExp(REACT, 'i') })).toHaveCount(1)
  })

  // plans/plan-expenses-posibles-duplicados, T4: dos nombres que solo cambian en los puntos. La inactiva va primero
  // por orden alfabético; el backend pone la activa primero y la tabla no lo tiene que reordenar.
  test('«Possible duplicates» shows the similar names together, the active one first, and a merge clears the group', async ({ page }) => {
    await login(page)
    await openCompanies(page)
    await addCompany(page, SIMILAR_ACTIVE)
    await addCompany(page, SIMILAR_INACTIVE)
    await deactivate(page, SIMILAR_INACTIVE)

    await page.getByRole('switch', { name: 'Possible duplicates' }).click()
    await expect(page.getByRole('switch', { name: 'Show inactive' })).toBeDisabled()
    await search(page, STAMP)
    const body = page.locator('tbody')
    await expect(body.getByRole('row')).toHaveCount(2)
    await expect(body.getByRole('row').nth(0)).toContainText(SIMILAR_ACTIVE)
    await expect(body.getByRole('row').nth(0)).not.toContainText('Inactive')
    await expect(body.getByRole('row').nth(1)).toContainText(SIMILAR_INACTIVE)
    await expect(body.getByRole('row').nth(1)).toContainText('Inactive')
    await expect(page.getByTestId('expenses-settings-duplicate-groups')).toHaveText('1 group(s) with a similar name')
    await noHorizontalScroll(page)

    await body.getByRole('row').nth(1).getByRole('button', { name: 'Actions' }).click()
    await page.getByRole('menuitem', { name: 'Merge into…' }).click()
    await expect(page.getByRole('heading', { name: `Merge "${SIMILAR_INACTIVE} (0 expense(s), inactive)" into…` })).toBeVisible()
    await pickCombobox(page, 'target', SIMILAR_ACTIVE)
    await page.getByRole('button', { name: 'Merge', exact: true }).click()
    await page.getByRole('button', { name: 'Yes, merge' }).click()
    await expect(page.getByText('Merged: 0 expense(s) moved.')).toBeVisible()
    await expect(page.getByText('No possible duplicates.')).toBeVisible()
  })

  test('cleanup: delete the expense and deactivate what was created', async ({ page }) => {
    await login(page)
    if (expenseId > 0) await page.request.delete(`/api/srs-kpis/expenses/${expenseId}`)
    await openCompanies(page)
    for (const name of [KEEP, REACT, SIMILAR_ACTIVE]) {
      await search(page, name)
      if (await rowOf(page, name).isVisible().catch(() => false)) await deactivate(page, name)
    }
    await page.getByRole('tab', { name: 'Categories' }).click()
    await search(page, CATEGORY)
    if (await rowOf(page, CATEGORY).isVisible().catch(() => false)) await deactivate(page, CATEGORY)
  })
})
