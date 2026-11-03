/**
 * Rango por defecto de Expenses List. Corre con `pnpm vitest run`.
 */
import { describe, expect, it } from 'vitest'

import { toYmd } from '@/lib/expenses/expense-format'
import { getDefaultDateRange } from '@/lib/filters/date-range-presets'

import { expenseListDefaultRange, isSameYmdRange } from './expense-list-date-range'

describe('expenseListDefaultRange', () => {
  it('7 días que terminan hoy (03/11 → 28/10 al 03/11)', () => {
    const r = expenseListDefaultRange(new Date(2026, 10, 3, 9, 30))
    expect([toYmd(r.from), toYmd(r.to)]).toEqual(['2026-10-28', '2026-11-03'])
  })

  it('el default de las demás pantallas sigue terminando ayer', () => {
    const r = getDefaultDateRange(new Date(2026, 10, 3, 9, 30))
    expect(toYmd(r.to)).toBe('2026-11-02')
  })
})

describe('isSameYmdRange', () => {
  it('mismo día con otra hora: igual', () => {
    const a = expenseListDefaultRange(new Date(2026, 10, 3, 1, 0))
    const b = expenseListDefaultRange(new Date(2026, 10, 3, 23, 0))
    expect(isSameYmdRange(a, b)).toBe(true)
  })

  it('un día distinto: distinto', () => {
    expect(isSameYmdRange(expenseListDefaultRange(new Date(2026, 10, 3)), expenseListDefaultRange(new Date(2026, 10, 4)))).toBe(false)
  })

  it('vacío contra un rango: distinto', () => {
    expect(isSameYmdRange(undefined, expenseListDefaultRange())).toBe(false)
  })
})
