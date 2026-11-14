import { describe, expect, it } from 'vitest'

import {
  INVOICE_DISCOUNT_AMOUNT,
  INVOICE_DISCOUNT_ERROR_KEYS,
  INVOICE_DISCOUNT_PERCENT,
  checkInvoiceDiscount,
  type InvoiceDiscountError,
} from './invoice-discount-rules'
import { translate } from '@/lib/i18n/messages'

const bad: [string, number, InvoiceDiscountError][] = [
  ['', INVOICE_DISCOUNT_AMOUNT, 'required'],
  ['   ', INVOICE_DISCOUNT_PERCENT, 'required'],
  ['abc', INVOICE_DISCOUNT_AMOUNT, 'invalid'],
  ['1e3', INVOICE_DISCOUNT_AMOUNT, 'invalid'],
  ['10,5', INVOICE_DISCOUNT_AMOUNT, 'invalid'],
  ['-1', INVOICE_DISCOUNT_AMOUNT, 'negative'],
  ['-0.01', INVOICE_DISCOUNT_PERCENT, 'negative'],
  ['10.123', INVOICE_DISCOUNT_AMOUNT, 'decimals'],
  ['10.500', INVOICE_DISCOUNT_PERCENT, 'decimals'],
  ['101', INVOICE_DISCOUNT_PERCENT, 'percentOver100'],
  ['100.01', INVOICE_DISCOUNT_PERCENT, 'percentOver100'],
]

const good: [string | number, number, number][] = [
  ['0', INVOICE_DISCOUNT_AMOUNT, 0],
  ['-0', INVOICE_DISCOUNT_AMOUNT, 0],
  ['10', INVOICE_DISCOUNT_AMOUNT, 10],
  ['10.5', INVOICE_DISCOUNT_AMOUNT, 10.5],
  ['10.25', INVOICE_DISCOUNT_PERCENT, 10.25],
  ['.5', INVOICE_DISCOUNT_PERCENT, 0.5],
  ['100', INVOICE_DISCOUNT_PERCENT, 100],
  ['101', INVOICE_DISCOUNT_AMOUNT, 101],
  [25, INVOICE_DISCOUNT_AMOUNT, 25],
]

describe('checkInvoiceDiscount', () => {
  it.each(bad)('rejects %p (type %p) as %p', (raw, type, error) => {
    expect(checkInvoiceDiscount(raw, type as 1 | 2)).toEqual({ ok: false, error })
  })
  it.each(good)('accepts %p (type %p)', (raw, type, value) => {
    expect(checkInvoiceDiscount(raw, type as 1 | 2)).toEqual({ ok: true, value })
  })
})

describe('INVOICE_DISCOUNT_ERROR_KEYS', () => {
  it('every error has its text in EN and ES (D1)', () => {
    for (const key of Object.values(INVOICE_DISCOUNT_ERROR_KEYS)) {
      expect(translate('en', key)).not.toBe(key)
      expect(translate('es', key)).not.toBe(key)
    }
  })
  it('the approved texts', () => {
    expect(translate('en', INVOICE_DISCOUNT_ERROR_KEYS.required)).toBe('Required')
    expect(translate('en', INVOICE_DISCOUNT_ERROR_KEYS.negative)).toBe('The discount cannot be negative.')
    expect(translate('es', INVOICE_DISCOUNT_ERROR_KEYS.negative)).toBe('El descuento no puede ser negativo.')
    expect(translate('en', INVOICE_DISCOUNT_ERROR_KEYS.decimals)).toBe('Use up to two decimals.')
    expect(translate('es', INVOICE_DISCOUNT_ERROR_KEYS.decimals)).toBe('Usá hasta dos decimales.')
    expect(translate('en', INVOICE_DISCOUNT_ERROR_KEYS.percentOver100)).toBe('The percent cannot be over 100.')
    expect(translate('es', INVOICE_DISCOUNT_ERROR_KEYS.percentOver100)).toBe('El porcentaje no puede pasar de 100.')
  })
})
