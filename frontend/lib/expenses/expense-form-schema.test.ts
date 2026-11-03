/**
 * Esquema de Add / Edit Expense. Corre con `pnpm vitest run`.
 */
import { describe, expect, it } from 'vitest'

import {
  carrySplitToMode,
  createExpenseFormSchema,
  currentSplitAmounts,
  emptyExpenseFormValues,
  type ExpenseFormValues,
} from './expense-form-schema'

const m = {
  errDate: 'date',
  errAmount: 'amount',
  errPercent: 'percent',
  errPercentSum: 'sum {sum}',
  errChooseBranch: 'branch',
  errChooseTwoBranches: 'two',
  errChooseCompany: 'company',
  errChooseCategory: 'category',
  errUpTo: 'upto {n}',
}

const schema = createExpenseFormSchema({ todayNy: '2026-11-03', textOnly: false }, m)

const base = (over: Partial<ExpenseFormValues>): ExpenseFormValues => ({
  ...emptyExpenseFormValues('2026-11-03'),
  company: { id: 1, name: '441 Auto Rental' },
  category: { id: 1, name: 'Accident' },
  ...over,
})

const issues = (values: unknown) => {
  const r = schema.safeParse(values)
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
}

describe('createExpenseFormSchema, cambio de modo', () => {
  // Edit de un grupo By amount → By percentage: RHF desmonta la columna Amount y borra `amount`.
  // Antes daba «branches.286.amount: Required», un campo que no está en pantalla, y Save no hacía nada.
  it('By amount → By percentage: el error cae en el Percent que se ve, no en el Amount borrado', () => {
    const values = base({
      mode: 'percent',
      totalAmount: '154.00',
      branchIds: ['286', '344', '903'],
      branches: { '286': { percentage: '' }, '344': { percentage: '' }, '903': { percentage: '' } } as never,
    })
    expect(issues(values)).toEqual(['branches.286.percentage: percent'])
  })

  it('By percentage → By amount: el error cae en el Amount que se ve', () => {
    const values = base({
      mode: 'amount',
      branchIds: ['286', '344'],
      branches: { '286': { amount: '10.00' }, '344': { amount: '' } } as never,
    })
    expect(issues(values)).toEqual(['branches.344.amount: amount'])
  })

  it('By percentage que no suma 100: el error va a Dealers', () => {
    const values = base({
      mode: 'percent',
      totalAmount: '44.00',
      branchIds: ['755', '200', '199'],
      branches: { '755': { percentage: '44.00' }, '200': { percentage: '4' }, '199': { percentage: '10' } } as never,
    })
    expect(issues(values)).toEqual(['branchIds: sum 58.00'])
  })
})

describe('carrySplitToMode: el modo nuevo arranca con el reparto que se veía', () => {
  // Captura de Ignacio (03/11): Equal $50.00 entre 3 dealers; al pasar a By amount quedaba en blanco.
  const equal = base({
    mode: 'equal',
    totalAmount: '50.00',
    branchIds: ['199', '200', '755'],
    branches: { '199': { percentage: '', amount: '' }, '200': { percentage: '', amount: '' }, '755': { percentage: '', amount: '' } },
  })

  it('Equal → By amount: cada dealer con su monto', () => {
    const r = carrySplitToMode(equal, 'amount')
    expect(r?.branches).toMatchObject({
      '199': { amount: '16.66' },
      '200': { amount: '16.67' },
      '755': { amount: '16.67' },
    })
    expect(r?.totalAmount).toBe('50.00')
  })

  it('Equal → By percentage: suman 100 y vuelven a dar los mismos montos', () => {
    const r = carrySplitToMode(equal, 'percent')
    const pcts = ['199', '200', '755'].map((id) => r?.branches[id].percentage)
    expect(pcts).toEqual(['33.32', '33.34', '33.34'])
    expect(currentSplitAmounts({ ...equal, mode: 'percent', branches: r!.branches })).toEqual({
      '199': '16.66',
      '200': '16.67',
      '755': '16.67',
    })
  })

  it('By amount → Equal: el total es la suma', () => {
    const amount = base({
      mode: 'amount',
      branchIds: ['286', '344', '903'],
      branches: { '286': { percentage: '', amount: '55' }, '344': { percentage: '', amount: '55' }, '903': { percentage: '', amount: '44' } },
    })
    expect(carrySplitToMode(amount, 'equal')?.totalAmount).toBe('154.00')
  })

  it('reparto incompleto (un porcentaje vacío): no se toca nada', () => {
    const percent = base({
      mode: 'percent',
      totalAmount: '44.00',
      branchIds: ['199', '200'],
      branches: { '199': { percentage: '44', amount: '' }, '200': { percentage: '', amount: '' } },
    })
    expect(carrySplitToMode(percent, 'amount')).toBeNull()
  })
})
