/**
 * Expense Piecework que sigue a sus WO — T5b de plans/plan-reunion-juan-18-11 (v9, tema 4, sección v6, D18), camino
 * entero en 375×812 y 1280×800 (Chromium de Playwright). Contra la copia local de PROD en http://pro.srs.com con el
 * usuario de `.env.e2e.local` (Admin Company de Auto Wax).
 *
 * Lo que recorre: se carga una expense Piecework de Francol (octubre, 2 WO de Land Rover Ft Lauderdale) → Monthly
 * Closing de octubre → Expenses List: sin la marca de cambios → Edit: se saca una WO y se agrega otra → Save → el switch
 * «Piecework with changes» la trae, con la marca → … › Log: el historial dice «Removed in Edit» y «Added in Edit»,
 * con quién → Monthly Closing: Expenses subió y Payroll bajó la diferencia → se borra la expense.
 *
 * El recálculo de la noche (la WO cambia en el legacy y el job del snapshot la sigue) lo prueba
 * `backend/src/features/srs-expense/expense-piecework-recalc-integration.spec.ts`, con el job corrido a mano: el job
 * solo lo corre el Admin General y el usuario del e2e es Admin Company.
 */
import { expect, test } from '@playwright/test'
import {
  E2E_MISSING_USER,
  E2E_MISSING_USER_REASON,
  filterExpensesByCompany,
  login,
  monthlyClosingDealer,
  noHorizontalScroll,
  pickAllDealersAndDatePreset,
} from './helpers'

test.skip(E2E_MISSING_USER, E2E_MISSING_USER_REASON)

const VENDOR_ID = 6985 // Francol Services LLC (empresa 79)
const VENDOR_NAME = 'Francol Services LLC'
const DEALER = 'AutoNation Land Rover Ft Lauderdale'
const MONTH = 'October 2026'
const DESCRIPTION_PREFIX = 'e2e piecework changes'

interface Wo {
  idInvoice: number
  nro: string
  dealer: { id: number; name: string }
  piecework: string
}

const cents = (v: string | number) => Math.round(Number(v) * 100)

test.describe.serial('Piecework expense — follows its work orders', () => {
  test('Edit adds and removes work orders; the list switch, the mark and the history show it; Monthly Closing follows', async ({
    page,
  }, testInfo) => {
    // Dos cierres de octubre con All Dealers: cada uno tarda 1–2 min contra la copia local.
    test.setTimeout(900_000)
    const description = `${DESCRIPTION_PREFIX} ${testInfo.project.name} ${Date.now()}`
    await login(page)

    // Tres WO libres de Francol del mismo dealer: A y B van en el alta; en Edit sale A y entra C.
    const free = await page.evaluate(async (vendorId) => {
      const r = await fetch(`/api/srs-kpis/expenses/piecework-work-orders?vendorId=${vendorId}&month=2026-10`)
      return (await r.json()) as { workOrders: Wo[] }
    }, VENDOR_ID)
    const ofDealer = free.workOrders.filter((w) => w.dealer.name === DEALER)
    expect(ofDealer.length).toBeGreaterThanOrEqual(3)
    const [a, b, c] = ofDealer
    const created = await page.evaluate(
      async (body) => {
        const r = await fetch('/api/srs-kpis/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        return { status: r.status, json: (await r.json()) as { kind: 'single' | 'group'; id?: number; groupId?: number } }
      },
      { ticketDate: '2026-10-20', pieceworkVendorId: VENDOR_ID, invoiceIds: [a.idInvoice, b.idInvoice], description, notes: 'e2e' },
    )
    expect(created.status).toBe(201)
    const deleteUrl =
      created.json.kind === 'group' ? `/api/srs-kpis/expenses/groups/${created.json.groupId}` : `/api/srs-kpis/expenses/${created.json.id}`

    try {
      const before = await monthlyClosingDealer(page, MONTH, DEALER)

      await page.goto('/expenses')
      await pickAllDealersAndDatePreset(page, 'Last Month')
      await filterExpensesByCompany(page, VENDOR_NAME)
      const row = page.getByRole('row').filter({ hasText: description })
      await expect(row).toBeVisible({ timeout: 30_000 })
      await expect(row.getByTestId('expense-piecework-changed-mark')).toHaveCount(0)

      // Edit: vendor y fecha fijos; las WO de la expense marcadas y las libres en la misma tabla.
      await row.getByRole('button', { name: 'Edit' }).click()
      const form = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Edit Expense' }) })
      await expect(form.locator('#exp-pw-vendor')).toHaveValue(VENDOR_NAME)
      await expect(form.getByTestId('piecework-periods')).toHaveText('Work orders from Oct 1 to Oct 30, 2026', { timeout: 60_000 })
      const woRow = (w: Wo) => form.locator('tbody tr').filter({ hasText: w.nro })
      await expect(woRow(a).getByRole('checkbox')).toBeChecked({ timeout: 60_000 })
      await expect(woRow(b).getByRole('checkbox')).toBeChecked()
      await expect(woRow(c).getByRole('checkbox')).not.toBeChecked()
      await woRow(a).getByRole('checkbox').click()
      await woRow(c).locator('td').nth(2).click() // toda la fila marca la WO
      await expect(woRow(c).getByRole('checkbox')).toBeChecked()
      await expect(form.getByTestId('piecework-total')).toHaveText(
        `$${((cents(b.piecework) + cents(c.piecework)) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      )
      await noHorizontalScroll(page)
      await form.getByRole('button', { name: 'Save' }).click()
      await expect(page.getByText('Expense saved.')).toBeVisible()

      // «Piecework with changes»: la trae, con la marca en el monto.
      await page.getByTestId('expense-piecework-changed').click()
      await expect(row).toBeVisible({ timeout: 30_000 })
      await expect(row.getByTestId('expense-piecework-changed-mark')).toBeVisible()

      // El historial va en el log de la expense (… › Log), no en Edit (Ignacio, 22/11): junto a las líneas de siempre,
      // el más nuevo arriba, con quién.
      await row.getByRole('button', { name: 'Actions' }).click()
      await page.getByRole('menuitem', { name: 'Log' }).click()
      const log = page.getByRole('dialog').filter({ has: page.getByText('Expense log') })
      await expect(log.getByTestId('piecework-history-entry')).toHaveCount(2, { timeout: 30_000 })
      await expect(log).toContainText('Removed in Edit')
      await expect(log).toContainText('Added in Edit')
      await expect(log).toContainText(`WO ${a.nro}`)
      await expect(log).toContainText(`WO ${c.nro}`)
      await expect(log).toContainText('by ')
      await noHorizontalScroll(page)
      await page.keyboard.press('Escape')

      // Monthly Closing: Expenses sube y Payroll baja la diferencia (C − A) en el dealer.
      const after = await monthlyClosingDealer(page, MONTH, DEALER)
      const delta = (cents(c.piecework) - cents(a.piecework)) / 100
      expect(Math.round((after.expenses - before.expenses) * 100) / 100).toBe(delta)
      expect(Math.round((before.payroll - after.payroll) * 100) / 100).toBe(delta)
    } finally {
      const status = await page.evaluate((url) => fetch(url, { method: 'DELETE' }).then((r) => r.status), deleteUrl)
      expect(status).toBe(204)
    }
  })
})
