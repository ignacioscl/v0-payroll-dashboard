import * as fs from 'fs'
import * as path from 'path'

import {
  ExpenseRuleError,
  MSG_AMOUNT_INVALID,
  MSG_DATE_INVALID,
  MSG_PERCENT_INVALID,
  checkRun,
  distributeAutomatic,
  fixedSum,
  fromCents,
  msgSumOver100,
  splitAmount,
  splitEqual,
  toCents,
  totalCents,
  validateAmount,
  validateAmountSplit,
  validateManualPercent,
  validateManualSum,
  validatePercentSplit,
  validateReceiptDate,
  validateRuleDates,
  withAutomaticRecalculated,
} from './expense-rules'

/** Casos compartidos con el front (vitest lee el mismo archivo). */
const CASES_PATH = path.resolve(__dirname, '../../../../../shared/expense-rules-cases.json')

type Cases = {
  amountBad: string[]
  amountGood: string[]
  percentBad: string[]
  percentGood: string[]
  split: { name: string; amount: string; assigns: { id: number; percentage: string }[]; expected: Record<string, string> }[]
  splitEqual: { name: string; amount: string; ids: number[]; expected: Record<string, string> }[]
  percentSplitBad: { name: string; rows: { id: number; percentage: string }[] }[]
  percentSplitGood: { name: string; rows: { id: number; percentage: string }[] }[]
  amountSplitBad: { name: string; rows: { id: number; amount: string }[] }[]
  amountSplitGood: { name: string; rows: { id: number; amount: string }[]; expectedTotal: string }[]
  receiptDate: { today: string; bad: string[]; good: string[] }
  ruleDates: { bad: { start: string; end: string | null }[]; good: { start: string; end: string | null }[] }
}

const cases: Cases = JSON.parse(fs.readFileSync(CASES_PATH, 'utf8'))

describe('expense-rules (pareja de frontend/lib/expenses/expense-rules.ts) — shared/expense-rules-cases.json', () => {
  it('lee todos los bloques del JSON compartido', () => {
    const blocks = [
      'amountBad',
      'amountGood',
      'percentBad',
      'percentGood',
      'split',
      'splitEqual',
      'percentSplitBad',
      'percentSplitGood',
      'amountSplitBad',
      'amountSplitGood',
      'receiptDate',
      'ruleDates',
    ]
    for (const b of blocks) expect(cases).toHaveProperty(b)
  })

  describe('validateAmount', () => {
    it.each(cases.amountBad)('rechaza %j', (value) => {
      expect(() => validateAmount(value)).toThrow(MSG_AMOUNT_INVALID)
    })
    it.each(cases.amountGood)('acepta %j', (value) => {
      expect(validateAmount(value)).toMatch(/^\d+\.\d{2}$/)
      expect(toCents(validateAmount(value))).toBe(toCents(value))
    })
  })

  describe('validateManualPercent', () => {
    it.each(cases.percentBad)('rechaza %j', (value) => {
      expect(() => validateManualPercent(value)).toThrow(MSG_PERCENT_INVALID)
    })
    it.each(cases.percentGood)('acepta %j', (value) => {
      expect(validateManualPercent(value)).toBe(toCents(value))
    })
  })

  describe('splitAmount (By percent, mismo ajuste de centavos que el cron)', () => {
    it.each(cases.split.map((c) => [c.name, c] as const))('%s', (_name, c) => {
      expect(splitAmount(c.amount, c.assigns)).toEqual(c.expected)
      const sum = Object.values(splitAmount(c.amount, c.assigns)).reduce((a, v) => a + toCents(v), 0)
      expect(sum).toBe(toCents(c.amount))
    })
    it('By fixed amount: cada dealer con monto recibe su monto, los demás no aparecen', () => {
      const res = splitAmount('7000.00', [
        { id: 1, fixedAmount: '3500.00' },
        { id: 2, fixedAmount: null },
        { id: 3, fixedAmount: '3500' },
      ], 2)
      expect(res).toEqual({ '1': '3500.00', '3': '3500.00' })
    })
  })

  describe('splitEqual (Add Expense › Equal)', () => {
    it.each(cases.splitEqual.map((c) => [c.name, c] as const))('%s', (_name, c) => {
      const res = splitEqual(toCents(c.amount), c.ids)
      expect(res).toEqual(c.expected)
      const sum = Object.values(res).reduce((a, v) => a + toCents(v), 0)
      expect(sum).toBe(toCents(c.amount))
    })
  })

  describe('validatePercentSplit (Add Expense › By percentage)', () => {
    it.each(cases.percentSplitBad.map((c) => [c.name, c] as const))('rechaza %s', (_name, c) => {
      expect(() => validatePercentSplit(c.rows)).toThrow(ExpenseRuleError)
    })
    it.each(cases.percentSplitGood.map((c) => [c.name, c] as const))('acepta %s', (_name, c) => {
      const out = validatePercentSplit(c.rows)
      expect(out.reduce((a, r) => a + toCents(r.percentage), 0)).toBe(10000)
    })
  })

  describe('validateAmountSplit (Add Expense › By amount)', () => {
    it.each(cases.amountSplitBad.map((c) => [c.name, c] as const))('rechaza %s', (_name, c) => {
      expect(() => validateAmountSplit(c.rows)).toThrow(ExpenseRuleError)
    })
    it.each(cases.amountSplitGood.map((c) => [c.name, c] as const))('acepta %s', (_name, c) => {
      expect(validateAmountSplit(c.rows).total).toBe(c.expectedTotal)
    })
  })

  describe('validateReceiptDate (D9: real, no futura, sin piso)', () => {
    it.each(cases.receiptDate.bad)('rechaza %j', (value) => {
      expect(() => validateReceiptDate(value, cases.receiptDate.today)).toThrow(MSG_DATE_INVALID)
    })
    it.each(cases.receiptDate.good)('acepta %j', (value) => {
      expect(validateReceiptDate(value, cases.receiptDate.today)).toBe(value)
    })
  })

  describe('validateRuleDates', () => {
    it.each(cases.ruleDates.bad.map((c) => [JSON.stringify(c), c] as const))('rechaza %s', (_n, c) => {
      expect(() => validateRuleDates(c.start, c.end)).toThrow(ExpenseRuleError)
    })
    it.each(cases.ruleDates.good.map((c) => [JSON.stringify(c), c] as const))('acepta %s', (_n, c) => {
      expect(validateRuleDates(c.start, c.end)).toEqual({ start: c.start, end: c.end })
    })
  })

  describe('reglas de la regla recurrente (portadas del PHP)', () => {
    const assigns = [
      { id: 1, percentage: '50.00', automatic: false },
      { id: 2, percentage: '25.00', automatic: true },
      { id: 3, percentage: '25.00', automatic: true },
    ]

    it('totalCents suma y devuelve null si falta un porcentaje', () => {
      expect(totalCents(assigns)).toBe(10000)
      expect(totalCents([{ id: 1, percentage: null }])).toBeNull()
    })

    it('distributeAutomatic reparte lo que dejan los Manual; el último por id se lleva el resto', () => {
      expect(distributeAutomatic([
        { id: 1, percentage: '33.33', automatic: false },
        { id: 3, percentage: null, automatic: true },
        { id: 2, percentage: null, automatic: true },
      ])).toEqual({ '2': '33.33', '3': '33.34' })
      expect(distributeAutomatic([{ id: 1, percentage: '10', automatic: false }])).toEqual({})
    })

    it('withAutomaticRecalculated: los Automatic grabados con el redondeo viejo (15 × 6.67 = 100.05 %) vuelven a sumar 100', () => {
      const stale = Array.from({ length: 15 }, (_, i) => ({ id: i + 1, percentage: '6.67', automatic: true }))
      expect(totalCents(stale)).toBe(10005)
      const fresh = withAutomaticRecalculated(stale)
      expect(totalCents(fresh)).toBe(10000)
      expect(checkRun('5100.00', fresh)).toBeNull()
      // Los Manual no se tocan.
      const mixed = [
        { id: 1, percentage: '60.00', automatic: false },
        { id: 2, percentage: '40.03', automatic: true },
      ]
      expect(withAutomaticRecalculated(mixed).map((a) => a.percentage)).toEqual(['60.00', '40.00'])
    })

    it('el cron (checkRun + splitAmount) usa los Automatic recalculados: Insurance 15 × 6.67 genera $5,100.00 exactos', () => {
      const stale = Array.from({ length: 15 }, (_, i) => ({ id: i + 1, percentage: '6.67', automatic: true }))
      expect(checkRun('5100.00', stale)).toBeNull()
      const amounts = splitAmount('5100.00', stale)
      expect(Object.values(amounts).reduce((s, v) => s + toCents(v), 0)).toBe(510000)
      expect(amounts['1']).toBe('339.66')
      expect(amounts['15']).toBe('344.76')
      // Payroll Taxes: 13 × 7.69 = 99.97 %.
      const payroll = Array.from({ length: 13 }, (_, i) => ({ id: i + 1, percentage: '7.69', automatic: true }))
      expect(checkRun('8125.00', payroll)).toBeNull()
      // Los Manual que no suman 100 se siguen salteando (Expenses September 2026: 93.96 %).
      expect(checkRun('1000.00', [
        { id: 1, percentage: '90.00', automatic: false },
        { id: 2, percentage: '3.96', automatic: false },
      ])).toBe('percents add up to 93.96%')
    })

    it('validateManualSum rechaza Manual que pasan de 100 con el texto exacto', () => {
      expect(() =>
        validateManualSum([
          { id: 1, percentage: '60', automatic: false },
          { id: 2, percentage: '50', automatic: false },
        ]),
      ).toThrow(msgSumOver100('110.00'))
      expect(() => validateManualSum(assigns)).not.toThrow()
    })

    it('checkRun: By percent necesita Amount y 100 %', () => {
      expect(checkRun('100', assigns)).toBeNull()
      expect(checkRun('', assigns)).toBe('the Amount is empty')
      expect(checkRun('100', [{ id: 1, percentage: '93.96' }])).toBe('percents add up to 93.96%')
      expect(checkRun('100', [{ id: 1, percentage: null }])).toBe(
        'percents add up to an incomplete value (a dealer has no percent)',
      )
    })

    it('checkRun: By fixed amount compara la suma de los dealers con el Amount', () => {
      expect(checkRun('7000.00', [{ id: 1, fixedAmount: '3500' }, { id: 2, fixedAmount: '3500' }], 2)).toBeNull()
      expect(checkRun('7000.00', [{ id: 1, fixedAmount: null }], 2)).toBe('no dealer has an amount')
      expect(checkRun('7000.00', [{ id: 1, fixedAmount: '3500' }], 2)).toBe(
        "the dealers' amounts add up to 3500.00 and the Amount is 7000.00",
      )
      expect(fixedSum([{ id: 1, fixedAmount: '1.5' }, { id: 2, fixedAmount: '' }])).toBe('1.50')
      expect(fixedSum([{ id: 1 }])).toBeNull()
    })

    it('fromCents no pasa por float', () => {
      expect(fromCents(5)).toBe('0.05')
      expect(fromCents(100001)).toBe('1000.01')
      expect(fromCents(0)).toBe('0.00')
    })
  })
})
