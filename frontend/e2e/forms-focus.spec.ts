/**
 * «Todo form lleva la pantalla al campo que falta» (plans/plan-buenas-practicas-v0, 3.17), en 1280×800 y 375×812 (los
 * dos proyectos de playwright.config.ts). Contra http://pro.srs.com local, con el usuario de `.env.e2e.local`.
 *
 * Por cada formulario corregido: se envía con el campo vacío (o con un dato que no es real) y el campo queda con el
 * foco, entero a la vista y con su error debajo. Ninguno graba: todos se cortan en la validación del front.
 *
 * - Roles: Add Role y Add Template (combo Type vacío).
 * - Invoices: New generic invoice (dealer vacío; Add item sin descripción), Generate Xls Report → Send Email (Email To
 *   vacío y separado con «;»), Send email (dirección inválida; Queue Name vacío si no hay cola activa), Set discount
 *   (vacío, negativo, tres decimales, 101 %), PO (más de 16 caracteres).
 * - Punch (/issues, con un solo dealer en el encabezado: E2E_PUNCH_DEALER o el primero): Add punch sin empleado; Edit
 *   punch con Clock Out igual a Clock In.
 *
 * Lo que depende de la base local: Edit punch necesita un ponche en /issues, las acciones de Invoices una fila en
 * «Last Month» y PO el permiso «Edit PO/RO»; si falta, ese caso se saltea con el motivo.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import { E2E_MISSING_USER, E2E_MISSING_USER_REASON, login, pickDatePreset } from './helpers'

test.skip(E2E_MISSING_USER, E2E_MISSING_USER_REASON)

/** El foco está en el campo `field` (por `name` o dentro de su `data-field`), entero a la vista y visible. */
async function expectFocusOn(page: Page, field: string) {
  await expect
    .poll(
      () =>
        page.evaluate((f) => {
          const el = document.activeElement as HTMLElement | null
          if (!el || el === document.body) return ''
          if (el.getAttribute('name') === f || el.closest(`[data-field="${f}"]`)) return f
          return el.outerHTML.slice(0, 120)
        }, field),
      { message: `focus on «${field}»` },
    )
    .toBe(field)
  const focused = page.locator(':focus')
  await expect(focused).toBeVisible()
  await expect(focused).toBeInViewport({ ratio: 1 })
}

/** Encabezado (compu) u hoja de filtros (celular). */
async function filtersScope(page: Page): Promise<{ scope: Locator; apply: () => Promise<void> }> {
  const openFilters = page.getByRole('button', { name: 'Open filters' })
  const mobile = await openFilters.isVisible()
  if (mobile) await openFilters.click()
  // La hoja se llama «Filters»; el combo de dealers abre otro `dialog` (su popover) adentro.
  const sheet = page.getByRole('dialog', { name: 'Filters' })
  return {
    scope: mobile ? sheet : page.locator('header'),
    apply: async () => {
      if (!mobile) return
      await sheet.getByRole('button', { name: 'Apply', exact: true }).click()
      await expect(sheet).toBeHidden()
    },
  }
}

/** El combo de dealers del encabezado (`DealerMultiSelect`): dice «All Dealers», «N dealers» o el nombre de uno. */
function dealersCombo(scope: Locator): Locator {
  return scope.locator('button[role="combobox"][class*="min-w-[200px]"]').first()
}

/** El combo ya cargó la lista (mientras carga está deshabilitado y dice «Loading…»). */
async function dealersComboReady(scope: Locator): Promise<Locator> {
  const combo = dealersCombo(scope)
  await expect(combo).toBeEnabled({ timeout: 30_000 })
  await expect(combo).not.toContainText(/loading/i, { timeout: 30_000 })
  return combo
}

/**
 * Abre el combo de dealers y deja todos destildados o todos tildados. «All Dealers» (la primera fila) alterna:
 * con todos tildados los destilda; si no, los tilda.
 */
async function setAllDealers(page: Page, scope: Locator, checked: boolean) {
  await (await dealersComboReady(scope)).click()
  const all = page.locator('[data-slot="popover-content"] button').filter({ hasText: /All Dealers/i }).first()
  await expect(all).toBeVisible()
  const isChecked = async () => (await all.locator('svg.lucide-check').count()) > 0
  if ((await isChecked()) !== checked) await all.click()
  if ((await isChecked()) !== checked) await all.click()
}

/** All Dealers y «Last Month» en el encabezado, así la lista de Invoices trae filas y nada viene preelegido. */
async function allDealersLastMonth(page: Page) {
  const { scope, apply } = await filtersScope(page)
  if (!(await (await dealersComboReady(scope)).innerText()).includes('All Dealers')) {
    await setAllDealers(page, scope, true)
    await page.keyboard.press('Escape')
  }
  await pickDatePreset(page, scope, 'Last Month')
  await apply()
}

/** Un solo dealer en el encabezado (Add punch lo necesita): E2E_PUNCH_DEALER o el primero de la lista. */
async function pickOneDealer(page: Page) {
  const { scope, apply } = await filtersScope(page)
  await setAllDealers(page, scope, false)
  const popover = page.locator('[data-slot="popover-content"]')
  const name = process.env.E2E_PUNCH_DEALER
  if (name) {
    await popover.locator('[cmdk-input]').fill(name)
    await popover.locator('[cmdk-item]').filter({ hasText: name }).first().click()
  } else {
    await popover.locator('[cmdk-item]').first().click()
  }
  await page.keyboard.press('Escape')
  await expect(dealersCombo(scope)).not.toContainText(/All Dealers|\d+ dealers/i)
  await apply()
}

async function openInvoices(page: Page) {
  await login(page)
  await page.goto('/billing/invoices')
  await allDealersLastMonth(page)
  await expect(page.getByRole('heading', { name: 'Invoices' }).first()).toBeVisible()
}

/**
 * Abre el menú de acciones de la primera fila que tiene `item` («Set discount», «Send email»…) y lo elige. false si
 * ninguna de las primeras filas lo tiene.
 */
async function openRowAction(page: Page, item: RegExp): Promise<boolean> {
  const triggers = page.getByRole('button', { name: 'Actions', exact: true })
  await triggers.first().waitFor({ timeout: 30_000 }).catch(() => undefined)
  const count = Math.min(await triggers.count(), 15)
  for (let i = 0; i < count; i++) {
    await triggers.nth(i).scrollIntoViewIfNeeded()
    await triggers.nth(i).click()
    // Con el menú ya abierto (si no, una fila con la acción se saltea por llegar antes que el menú).
    await expect(page.getByRole('menuitem').first()).toBeVisible()
    const option = page.getByRole('menuitem', { name: item })
    if (await option.isVisible().catch(() => false)) {
      await option.click()
      return true
    }
    await page.keyboard.press('Escape')
  }
  return false
}

test.describe('Forms: the screen goes to the missing field (3.17)', () => {
  test('Add Role: empty Type gets the focus', async ({ page }) => {
    await login(page)
    await page.goto('/roles')
    await page.getByRole('button', { name: 'Add Role' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog.getByText('Type is required')).toBeVisible()
    await expectFocusOn(page, 'type')
  })

  test('Add Template: empty Type gets the focus', async ({ page }) => {
    await login(page)
    await page.goto('/roles/templates')
    await page.getByRole('button', { name: 'Add Template' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog.getByText('Type is required')).toBeVisible()
    await expectFocusOn(page, 'tipo')
  })

  test('New generic invoice: empty dealer, then Add item without description', async ({ page }) => {
    await openInvoices(page)
    // Sin dealer guardado ni uno solo en el encabezado, el combo arranca vacío.
    await page.evaluate(() => window.localStorage.removeItem('inv_generic'))
    await page.reload()
    await page.getByRole('button', { name: 'New generic invoice' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'New generic invoice' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Create invoice' }).click()
    await expectFocusOn(page, 'dealer')

    await dialog.getByRole('button', { name: 'Add item' }).click()
    await expect(dialog.getByText('Description is required.')).toBeVisible()
    await expect(dialog.getByText('Qty / Hrs is required and must be at least 0.01.')).toBeVisible()
    await expectFocusOn(page, 'description')

    // Con dealer y descripción, el primero que falta es Qty (la descripción pide el dealer antes).
    await dialog.locator('[data-field="dealer"]').getByRole('combobox').click()
    await page.locator('[cmdk-item]').first().click()
    await dialog.locator('[data-field="description"]').getByRole('combobox').click()
    await page.locator('[cmdk-input]').last().fill('e2e item')
    await page.getByRole('option', { name: /e2e item/ }).first().click()
    await dialog.getByRole('button', { name: 'Add item' }).click()
    await expect(dialog.getByText('Description is required.')).toBeHidden()
    await expectFocusOn(page, 'qty')
    // Sin grabar: Cancel y, si pregunta, descartar.
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    const discard = page.getByRole('button', { name: /discard/i })
    if (await discard.isVisible().catch(() => false)) await discard.click()
  })

  test('Generate Xls Report → Send Email: Email To empty, then separated with «;»', async ({ page }) => {
    await openInvoices(page)
    const exportButton = page.locator('button:has(svg.lucide-file-spreadsheet):has(svg.lucide-mail)').first()
    await expect(exportButton).toBeEnabled({ timeout: 30_000 })
    await exportButton.click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Send Email' }).first().click()
    // El botón de confirmar es el último «Send Email» (el primero es la tarjeta).
    await dialog.getByRole('button', { name: 'Send Email' }).last().click()
    await expect(dialog.getByText('This value is required.')).toBeVisible()
    await expectFocusOn(page, 'emailTo')

    await page.locator('#inv-export-email-to').fill('a@b.com; c@d.com')
    await dialog.getByRole('button', { name: 'Send Email' }).last().click()
    await expect(dialog.getByText('Separate the addresses with commas.')).toBeVisible()
    await expectFocusOn(page, 'emailTo')
  })

  test('Send email: an invalid address, and Queue Name when there is no active queue', async ({ page }) => {
    await openInvoices(page)
    test.skip(!(await openRowAction(page, /^(Send email|Resend email)$/)), 'No invoice with «Send email» in Last Month')
    const dialog = page.getByRole('dialog')
    await page.locator('#inv-email-to').fill('a@b')
    await dialog.getByRole('button', { name: 'Send email', exact: true }).click()
    await expect(dialog.getByText('Enter one or more valid email addresses.')).toBeVisible()
    await expectFocusOn(page, 'emailTo')

    await page.locator('#inv-email-to').fill('')
    // Sin cola activa, «Add to email queue» con Queue Name vacío no graba: el error va bajo el campo.
    const queueName = page.locator('#inv-email-queue-name')
    if (await queueName.isVisible().catch(() => false)) {
      await dialog.getByRole('button', { name: 'Add to email queue' }).click()
      await expect(dialog.getByText(/queue name/i).last()).toBeVisible()
      await expectFocusOn(page, 'queueName')
    }
  })

  test('Set discount: empty, negative, three decimals and 101 %', async ({ page }) => {
    await openInvoices(page)
    test.skip(!(await openRowAction(page, /^Set discount$/)), 'No invoice with «Set discount» in Last Month')
    const dialog = page.getByRole('dialog')
    const input = page.locator('#inv-discount-value')
    const save = dialog.getByRole('button', { name: 'Save' })

    await input.fill('')
    await save.click()
    await expect(dialog.getByText('Required', { exact: true })).toBeVisible()
    await expectFocusOn(page, 'discount')

    await input.fill('-5')
    await save.click()
    await expect(dialog.getByText('The discount cannot be negative.')).toBeVisible()
    await expectFocusOn(page, 'discount')

    await input.fill('10.123')
    await save.click()
    await expect(dialog.getByText('Use up to two decimals.')).toBeVisible()

    await dialog.getByText('Percent (%)').first().click()
    await input.fill('101')
    await save.click()
    await expect(dialog.getByText('The percent cannot be over 100.')).toBeVisible()
    await expectFocusOn(page, 'discount')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })

  test('PO: more than 16 characters stays in the field with its error', async ({ page }) => {
    await openInvoices(page)
    const poCell = page.locator('button:has(svg.lucide-pencil)').first()
    test.skip(!(await poCell.isVisible({ timeout: 30_000 }).catch(() => false)), 'No editable PO in Last Month (or the user lacks «Edit PO/RO»)')
    await poCell.scrollIntoViewIfNeeded()
    await poCell.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: /Edit PO \/ RO/ })).toBeVisible()
    await page.locator('#inv-po-ro-value').fill('12345678901234567')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog.getByText('Max 16 characters.')).toBeVisible()
    await expectFocusOn(page, 'poRo')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })

  test('Add punch: no employee gets the focus', async ({ page }) => {
    await login(page)
    await page.goto('/issues')
    await pickOneDealer(page)
    await page.locator('header button:has(svg[class*="plus"])').first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Add Punch').first()).toBeVisible()
    await dialog.getByRole('button', { name: 'Create punch' }).click()
    await expect(dialog.getByText('Required', { exact: true }).first()).toBeVisible()
    await expectFocusOn(page, 'employee')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })

  test('Edit punch: a Clock Out that is not after Clock In gets the focus', async ({ page }) => {
    await login(page)
    await page.goto('/issues')
    await pickOneDealer(page)
    const edit = page.getByRole('button', { name: /^Edit punch for / }).first()
    test.skip(!(await edit.isVisible({ timeout: 20_000 }).catch(() => false)), 'No punch to edit in /issues')
    await edit.click()
    const dialog = page.getByRole('dialog')
    const punchIn = dialog.locator('input[name="punchIn"]')
    await expect(punchIn).not.toHaveValue('')
    // Clock Out igual a Clock In: «Must be after Clock In» bajo Clock Out, con el foco ahí. No se graba.
    await dialog.locator('input[name="punchOut"]').fill(await punchIn.inputValue())
    await dialog.getByRole('button', { name: 'Update' }).click()
    await expect(dialog.getByText('Must be after Clock In')).toBeVisible()
    await expectFocusOn(page, 'punchOut')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })
})
