import { describe, expect, it } from 'vitest'

import { expenseKindLocked, keepAvailable, selectedDealerIds, selectedTotal } from './expense-piecework'
import { createExpenseFormSchema, emptyExpenseFormValues, expenseFormValuesToPayload } from './expense-form-schema'
import type { PieceworkWorkOrder } from '@/lib/srs-expenses-api'

const wo = (idInvoice: number, dealer: number, piecework: string): PieceworkWorkOrder => ({
  idInvoice,
  nro: `LFT${idInvoice}`,
  vin: '',
  dealer: { id: dealer, name: `D${dealer}` },
  date: '2026-10-05',
  piecework,
  services: ['BodyWork'],
})

const LIST = [wo(1, 627, '105.00'), wo(2, 627, '210.50'), wo(3, 301, '70.25')]

describe('Expense Piecework — lo que se ve en el form (temas 3 y 4)', () => {
  it('el total es la suma del piecework de las WO marcadas, al centavo', () => {
    expect(selectedTotal([1, 3], LIST)).toBe('175.25')
    expect(selectedTotal([], LIST)).toBe('0.00')
  })

  it('al cambiar el vendor o el mes, las marcadas que ya no están se sueltan', () => {
    expect(keepAvailable([1, 2, 9], LIST)).toEqual([1, 2])
  })

  it('los dealers del gasto son los de las WO marcadas, sin repetir', () => {
    expect(selectedDealerIds([1, 2, 3], LIST).sort()).toEqual(['301', '627'])
  })
})

describe('Add Expense tipo Piecework — esquema y cuerpo (pareja de CreateExpenseDto)', () => {
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
    errChooseVendor: 'vendor',
    errChooseWorkOrders: 'workOrders',
  }
  const schema = createExpenseFormSchema({ todayNy: '2026-11-21' }, m)
  const issues = (values: unknown) => {
    const r = schema.safeParse(values)
    return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
  }

  it('pide el vendor y al menos una WO; no pide dealers, compañía, categoría ni monto', () => {
    const v = { ...emptyExpenseFormValues('2026-11-21'), kind: 'piecework' as const }
    expect(issues(v)).toEqual(['pieceworkVendorId: vendor', 'invoiceIds: workOrders'])
    expect(issues({ ...v, pieceworkVendorId: 6985, invoiceIds: [1] })).toEqual([])
  })

  it('la fecha se valida igual que en un gasto común', () => {
    const v = { ...emptyExpenseFormValues('2026-11-21'), kind: 'piecework' as const, pieceworkVendorId: 6985, invoiceIds: [1] }
    expect(issues({ ...v, ticketDate: '' })).toEqual(['ticketDate: date'])
  })

  it('el cuerpo lleva solo la fecha, los textos, el vendor y las WO', () => {
    const payload = expenseFormValuesToPayload({
      ...emptyExpenseFormValues('2026-11-21'),
      kind: 'piecework',
      ticketDate: '2026-10-31',
      pieceworkVendorId: 6985,
      invoiceIds: [1, 3],
      notes: 'octubre',
    })
    expect(payload).toEqual({ ticketDate: '2026-10-31', notes: 'octubre', pieceworkVendorId: 6985, invoiceIds: [1, 3] })
  })

  it('un gasto común no cambia: sin vendor ni WO en el cuerpo', () => {
    const payload = expenseFormValuesToPayload({
      ...emptyExpenseFormValues('2026-11-21'),
      company: { id: 1, name: 'X' },
      category: { id: 2, name: 'Y' },
      idDealer: '627',
      totalAmount: '10.00',
    })
    expect(payload).toMatchObject({ mode: 'single', idDealer: 627, totalAmount: '10.00' })
    expect(payload).not.toHaveProperty('pieceworkVendorId')
    expect(payload).not.toHaveProperty('invoiceIds')
  })
})

describe('Tarjetas Regular / Piecework: con datos cargados no se cambia (Ignacio, 22/11)', () => {
  const base = {
    kind: 'regular' as const,
    idDealer: '',
    branchIds: [] as string[],
    totalAmount: '',
    branches: {} as Record<string, { percentage?: string; amount?: string }>,
    pieceworkVendorId: null as number | null,
    invoiceIds: [] as number[],
  }

  it('Regular vacío se puede cambiar; con dealer, dealers, monto o un valor de la tabla, no', () => {
    expect(expenseKindLocked(base)).toBe(false)
    expect(expenseKindLocked({ ...base, idDealer: '627' })).toBe(true)
    expect(expenseKindLocked({ ...base, branchIds: ['627'] })).toBe(true)
    expect(expenseKindLocked({ ...base, totalAmount: '10' })).toBe(true)
    expect(expenseKindLocked({ ...base, branches: { '627': { amount: '5' } } })).toBe(true)
    expect(expenseKindLocked({ ...base, branches: { '627': { amount: ' ', percentage: '' } } })).toBe(false)
  })

  it('Piecework vacío se puede cambiar; con vendor o alguna WO, no', () => {
    const pw = { ...base, kind: 'piecework' as const }
    expect(expenseKindLocked(pw)).toBe(false)
    expect(expenseKindLocked({ ...pw, pieceworkVendorId: 6985 })).toBe(true)
    expect(expenseKindLocked({ ...pw, invoiceIds: [1] })).toBe(true)
    // Lo de Regular no cuenta estando en Piecework.
    expect(expenseKindLocked({ ...pw, totalAmount: '10' })).toBe(false)
  })
})
