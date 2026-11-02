/**
 * Pareja de backend/src/features/srs-expense/rules/expense-rules.spec.ts (jest): los dos leen
 * shared/expense-rules-cases.json. Corre con `pnpm vitest run` (falta `pnpm add -D vitest`).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  SPLIT_BY_PERCENT,
  checkRun,
  distributeAutomatic,
  fixedSum,
  isValidAmount,
  isValidPercent,
  splitAmount,
  splitEqual,
  toCents,
  validateAmount,
  validateAmountSplit,
  validateManualPercent,
  validatePercentSplit,
  validateReceiptDate,
  validateRuleDates,
  type RuleAssign,
} from './expense-rules'

type SplitCase = {
  name: string
  amount: string
  assigns: { id: number; percentage: string }[]
  expected: Record<string, string>
}

type Cases = {
  amountBad: string[]
  amountGood: string[]
  percentBad: string[]
  percentGood: string[]
  split: SplitCase[]
  splitEqual: { name: string; amount: string; ids: number[]; expected: Record<string, string> }[]
  percentSplitBad: { name: string; rows: { id: number; percentage: string }[] }[]
  percentSplitGood: { name: string; rows: { id: number; percentage: string }[] }[]
  amountSplitBad: { name: string; rows: { id: number; amount: string }[] }[]
  amountSplitGood: { name: string; rows: { id: number; amount: string }[]; expectedTotal: string }[]
  receiptDate: { today: string; bad: string[]; good: string[] }
  ruleDates: { bad: { start: string; end: string | null }[]; good: { start: string; end: string | null }[] }
}

const cases = JSON.parse(
  readFileSync(resolve(__dirname, '../../../shared/expense-rules-cases.json'), 'utf8'),
) as Cases

const toAssigns = (rows: { id: number; percentage: string }[]): RuleAssign[] =>
  rows.map((r) => ({ id: r.id, percentage: r.percentage, fixedAmount: null, automatic: false }))

describe('validateAmount', () => {
  it.each(cases.amountBad)('rejects %p', (v) => {
    expect(() => validateAmount(v)).toThrow()
    expect(isValidAmount(v)).toBe(false)
  })
  it.each(cases.amountGood)('accepts %p', (v) => {
    expect(validateAmount(v)).toMatch(/^\d+\.\d{2}$/)
    expect(isValidAmount(v)).toBe(true)
  })
})

describe('validateManualPercent', () => {
  it.each(cases.percentBad)('rejects %p', (v) => {
    expect(() => validateManualPercent(v)).toThrow()
    expect(isValidPercent(v)).toBe(false)
  })
  it.each(cases.percentGood)('accepts %p', (v) => {
    expect(validateManualPercent(v)).toBe(toCents(v))
  })
})

describe('splitAmount (By percent, same cents as the cron)', () => {
  it.each(cases.split)('$name', (c) => {
    expect(splitAmount(c.amount, toAssigns(c.assigns), SPLIT_BY_PERCENT)).toEqual(c.expected)
  })
  it('By fixed amount gives each dealer its amount and skips the ones without', () => {
    const assigns: RuleAssign[] = [
      { id: 1, percentage: null, fixedAmount: '10.50', automatic: false },
      { id: 2, percentage: null, fixedAmount: null, automatic: false },
    ]
    expect(splitAmount('10.50', assigns, 2)).toEqual({ 1: '10.50' })
    expect(fixedSum(assigns)).toBe('10.50')
    expect(checkRun('10.50', assigns, 2)).toBeNull()
    expect(checkRun('11.00', assigns, 2)).toContain('add up to 10.50')
  })
})

describe('splitEqual', () => {
  it.each(cases.splitEqual)('$name', (c) => {
    expect(splitEqual(toCents(c.amount), c.ids)).toEqual(c.expected)
  })
})

describe('validatePercentSplit', () => {
  it.each(cases.percentSplitBad)('rejects $name', (c) => {
    expect(() => validatePercentSplit(c.rows)).toThrow()
  })
  it.each(cases.percentSplitGood)('accepts $name', (c) => {
    const cents = validatePercentSplit(c.rows)
    expect(Object.values(cents).reduce((a, b) => a + b, 0)).toBe(10000)
  })
  it('names the sum in the error', () => {
    expect(() => validatePercentSplit(cases.percentSplitBad[0].rows)).toThrow(
      'Percents add up to 99.99%. They must add up to 100%.',
    )
  })
})

describe('validateAmountSplit', () => {
  it.each(cases.amountSplitBad)('rejects $name', (c) => {
    expect(() => validateAmountSplit(c.rows)).toThrow()
  })
  it.each(cases.amountSplitGood)('accepts $name', (c) => {
    expect(validateAmountSplit(c.rows).total).toBe(c.expectedTotal)
  })
})

describe('validateReceiptDate (D9, today in New York)', () => {
  it.each(cases.receiptDate.bad)('rejects %p', (v) => {
    expect(() => validateReceiptDate(v, cases.receiptDate.today)).toThrow(
      'Choose a valid date (not in the future).',
    )
  })
  it.each(cases.receiptDate.good)('accepts %p', (v) => {
    expect(validateReceiptDate(v, cases.receiptDate.today)).toBe(v)
  })
})

describe('validateRuleDates', () => {
  it.each(cases.ruleDates.bad)('rejects %o', (c) => {
    expect(() => validateRuleDates(c.start, c.end)).toThrow()
  })
  it.each(cases.ruleDates.good)('accepts %o', (c) => {
    expect(validateRuleDates(c.start, c.end)).toEqual({ start: c.start, end: c.end })
  })
})

describe('distributeAutomatic', () => {
  it('splits what the Manual ones leave, last id takes the rounding', () => {
    const assigns: RuleAssign[] = [
      { id: 1, percentage: '10.00', fixedAmount: null, automatic: false },
      { id: 2, percentage: null, fixedAmount: null, automatic: true },
      { id: 3, percentage: null, fixedAmount: null, automatic: true },
      { id: 4, percentage: null, fixedAmount: null, automatic: true },
    ]
    expect(distributeAutomatic(assigns)).toEqual({ 2: '30.00', 3: '30.00', 4: '30.00' })
    assigns[0].percentage = '10.01'
    expect(distributeAutomatic(assigns)).toEqual({ 2: '29.99', 3: '29.99', 4: '30.01' })
  })
})
