/**
 * Descuento de una invoice (Billing → Invoices → Set discount): qué valor se puede grabar.
 *
 * - Vacío no es 0: es «Required» (antes `Number('')` grababa 0 sin avisar).
 * - Un número, no negativo, con hasta dos decimales (la columna es `INVOICE_STATEMENT.discount decimal(8,2)`).
 * - En porcentaje, hasta 100.
 *
 * Pareja: `InvoiceStatementActionsService::setDiscount` del PHP (public/php/services/invoice/, repo legacy), que
 * controla lo mismo al grabar; ese además rechaza un descuento mayor a lo que falta cobrar (`assertDiscountFits`).
 * plans/plan-buenas-practicas-v0, 3.17.
 */

export const INVOICE_DISCOUNT_PERCENT = 1
export const INVOICE_DISCOUNT_AMOUNT = 2

export type InvoiceDiscountType = typeof INVOICE_DISCOUNT_PERCENT | typeof INVOICE_DISCOUNT_AMOUNT

export type InvoiceDiscountError = 'required' | 'invalid' | 'negative' | 'decimals' | 'percentOver100'

export type InvoiceDiscountCheck = { ok: true; value: number } | { ok: false; error: InvoiceDiscountError }

/** Un número escrito a mano: signo opcional, enteros y hasta cualquier cantidad de decimales (los cuenta la regla). */
const NUMBER_RE = /^-?(\d+(\.\d*)?|\.\d+)$/

export function checkInvoiceDiscount(raw: string | number | null | undefined, type: InvoiceDiscountType): InvoiceDiscountCheck {
  const text = String(raw ?? '').trim()
  if (text === '') return { ok: false, error: 'required' }
  if (!NUMBER_RE.test(text)) return { ok: false, error: 'invalid' }
  const value = Number(text)
  if (!Number.isFinite(value)) return { ok: false, error: 'invalid' }
  if (value < 0) return { ok: false, error: 'negative' }
  const decimals = text.includes('.') ? text.split('.')[1].length : 0
  if (decimals > 2) return { ok: false, error: 'decimals' }
  if (type === INVOICE_DISCOUNT_PERCENT && value > 100) return { ok: false, error: 'percentOver100' }
  // `-0` es 0.
  return { ok: true, value: value === 0 ? 0 : value }
}

/** Textos de cada error. */
export const INVOICE_DISCOUNT_ERROR_KEYS: Record<InvoiceDiscountError, string> = {
  required: 'common.required',
  invalid: 'invoices.actionDiscountInvalid',
  negative: 'invoices.actionDiscountNegative',
  decimals: 'invoices.actionDiscountDecimals',
  percentOver100: 'invoices.actionDiscountPercentOver100',
}
