import { TINT_EXPENSE_CATEGORY } from '../monthly-closing/monthly-closing-math'

/**
 * Categoría de gastos (GENERIC_DATA 35) que Monthly Closing suma en la columna Accident: la que se llama así, sin
 * mayúsculas ni espacios de borde (expense-report.repository.ts, `amountsByDealer`). Sin ids fijos.
 */
export const ACCIDENT_EXPENSE_CATEGORY = 'accident'

/**
 * «Clase de cierre» de una categoría de gastos: los cierres leen dos categorías por nombre (Window Tint Closing la
 * de tint, `TINT_EXPENSE_CATEGORY`; Monthly Closing la de Accident). El Merge de Settings solo une categorías de la
 * misma clase, así los cierres de meses pasados no cambian (plan-expenses-settings, §3.6).
 */
export type ExpenseClosingClass = 'tint' | 'accident' | null

export function expenseClosingClass(name: string | null | undefined): ExpenseClosingClass {
  const normalized = String(name ?? '').trim().toLowerCase()
  if (normalized === TINT_EXPENSE_CATEGORY) return 'tint'
  if (normalized === ACCIDENT_EXPENSE_CATEGORY) return 'accident'
  return null
}
