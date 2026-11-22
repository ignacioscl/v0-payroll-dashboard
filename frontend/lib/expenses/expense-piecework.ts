/**
 * Expense Piecework (temas 3 y 4 de plan-reunion-juan-18-11): lo que el form calcula con la lista de WO. El monto que
 * se graba lo recalcula el Nest (ExpensePieceworkService.resolveForCreate); esto es lo que se ve.
 */
import { fromCents, toCents } from '@/lib/expenses/expense-rules'
import type { PieceworkWorkOrder } from '@/lib/srs-expenses-api'

/** Las WO marcadas que siguen en la lista (al cambiar el vendor o el mes, las que ya no están se sueltan). */
export function keepAvailable(selected: readonly number[], available: readonly PieceworkWorkOrder[]): number[] {
  const ids = new Set(available.map((w) => w.idInvoice))
  return selected.filter((id) => ids.has(id))
}

/** Suma del piecework de las WO marcadas, con dos decimales. */
export function selectedTotal(selected: readonly number[], available: readonly PieceworkWorkOrder[]): string {
  const ids = new Set(selected)
  return fromCents(available.filter((w) => ids.has(w.idInvoice)).reduce((acc, w) => acc + toCents(w.piecework), 0))
}

/** Los dealers de las WO marcadas (para que el gasto quede a la vista en el header al grabar). */
export function selectedDealerIds(selected: readonly number[], available: readonly PieceworkWorkOrder[]): string[] {
  const ids = new Set(selected)
  return [...new Set(available.filter((w) => ids.has(w.idInvoice)).map((w) => String(w.dealer.id)))]
}


/**
 * Las tarjetas Regular / Piecework de Add Expense (Ignacio, 22/11): una vez que se cargó algo de un tipo, no se pasa
 * al otro. Regular: un dealer, dealers o montos/porcentajes. Piecework: el vendor o alguna WO. Si se borra todo, se
 * vuelve a poder cambiar.
 */
export function expenseKindLocked(values: {
  kind: 'regular' | 'piecework'
  idDealer: string
  branchIds: string[]
  totalAmount: string
  branches: Record<string, { percentage?: string; amount?: string }>
  pieceworkVendorId: number | null
  invoiceIds: number[]
}): boolean {
  if (values.kind === 'piecework') return values.pieceworkVendorId != null || values.invoiceIds.length > 0
  const anyBranchValue = Object.values(values.branches ?? {}).some(
    (b) => (b?.percentage ?? '').trim() !== '' || (b?.amount ?? '').trim() !== '',
  )
  return Boolean(values.idDealer) || values.branchIds.length > 0 || values.totalAmount.trim() !== '' || anyBranchValue
}

const MONTHS: Record<'en' | 'es', readonly string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'],
}

/**
 * El texto de arriba de la tabla de WO (Ignacio, 22/11): un solo rango, del primer día del primer pay period al último
 * del último, «Oct 31 to Nov 30, 2026» / «31 de oct. al 30 de nov. de 2026». Si cruza de año, cada punta con su año.
 * Devuelve la clave del texto y sus parámetros; null sin pay periods.
 */
export function pieceworkRangeText(
  periods: readonly { desde: string; hasta: string }[],
  locale: string,
): { key: 'expenses.pieceworkPeriods' | 'expenses.pieceworkPeriodsCrossYear'; params: Record<string, string> } | null {
  if (!periods.length) return null
  const desde = periods.reduce((m, p) => (p.desde < m ? p.desde : m), periods[0].desde)
  const hasta = periods.reduce((m, p) => (p.hasta > m ? p.hasta : m), periods[0].hasta)
  const lang = locale.startsWith('es') ? 'es' : 'en'
  const dayMonth = (ymd: string) => {
    const [, m, d] = ymd.split('-').map(Number)
    return lang === 'es' ? `${d} de ${MONTHS.es[m - 1]}` : `${MONTHS.en[m - 1]} ${d}`
  }
  const fromYear = desde.slice(0, 4)
  const toYear = hasta.slice(0, 4)
  if (fromYear === toYear) {
    return { key: 'expenses.pieceworkPeriods', params: { from: dayMonth(desde), to: dayMonth(hasta), year: toYear } }
  }
  return {
    key: 'expenses.pieceworkPeriodsCrossYear',
    params: { from: dayMonth(desde), fromYear, to: dayMonth(hasta), toYear },
  }
}
