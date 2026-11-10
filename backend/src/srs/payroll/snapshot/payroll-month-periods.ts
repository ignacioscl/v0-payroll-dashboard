import { PayrollPeriod } from './payroll-snapshot.types'
import { PayrollSourceRepository } from './payroll-source.repository'

/** Los períodos que terminan dentro del mes: los que el mes resta como Payroll (§4.3 de MC). */
export function periodsEndingIn(periods: PayrollPeriod[], firstDay: string, lastDay: string): PayrollPeriod[] {
  return periods.filter((p) => p.hasta >= firstDay && p.hasta <= lastDay)
}

/**
 * Períodos de pago de la empresa que terminan en el mes (T2 de plans/plan-monthly-closing/PLAN.md):
 * los de `TTK_DATE_GROUP_REPORT` que tocan algún día del mes, quedándose con los que terminan en él.
 * Septiembre 2026 en Auto Wax → 08/31–09/15 y 09/16–09/30. Sin `payment_method`, ninguno.
 */
export async function periodsEndingInMonth(
  source: PayrollSourceRepository,
  idContratista: number,
  firstDay: string,
  lastDay: string,
): Promise<PayrollPeriod[]> {
  const provider = await source.getProvider(idContratista)
  if (!provider) return []
  return periodsEndingIn(await source.getPeriods(provider, firstDay, lastDay), firstDay, lastDay)
}
