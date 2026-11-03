import type { ExpenseFormValues } from '@/lib/expenses/expense-form-schema'

/** Dealers del gasto que se acaba de guardar. */
export function savedDealerIds(values: Pick<ExpenseFormValues, 'mode' | 'idDealer' | 'branchIds'>): string[] {
  if (values.mode === 'single') return values.idDealer ? [values.idDealer] : []
  return values.branchIds
}

/**
 * Combo de dealers del header después de guardar: si ningún dealer del gasto está elegido, se suman, porque
 * la lista no lo mostraría y parecería que desapareció. Si ya se ve, devuelve el mismo arreglo.
 */
export function dealersToShowSaved(selected: string[], saved: string[]): string[] {
  if (!saved.length || saved.some((id) => selected.includes(id))) return selected
  return [...selected, ...saved]
}
