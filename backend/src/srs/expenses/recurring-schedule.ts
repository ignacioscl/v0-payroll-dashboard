import {
  RULE_FREQUENCY_WEEKLY,
} from 'src/features/srs-expense-repetitive/entity/expense-repetitive.entity'
import { addDays, dayOfMonth, weekDayOf } from './expense-period'

/** Lo que la agenda necesita de una regla. */
export interface RuleSchedule {
  frequency: number
  weekDay?: number | null
  startDate: string
  endDate?: string | null
  status?: number
}

/**
 * La regla genera ese día: mensual el día 1, semanal en su `week_day` (0 = Sunday como `date("w")` del cron), y
 * siempre dentro de `start_date`..`end_date` (DATE, puntas incluidas: la vigencia que el cron pasa a respetar en T6).
 */
export function isRunDay(rule: RuleSchedule, ymd: string): boolean {
  if (rule.status !== undefined && Number(rule.status) !== 1) return false
  if (ymd < rule.startDate.slice(0, 10)) return false
  if (rule.endDate && ymd > rule.endDate.slice(0, 10)) return false
  if (Number(rule.frequency) === RULE_FREQUENCY_WEEKLY) {
    return rule.weekDay !== null && rule.weekDay !== undefined && weekDayOf(ymd) === Number(rule.weekDay)
  }
  return dayOfMonth(ymd) === 1
}

/** La próxima corrida después de `today` (día 1 del mes siguiente o el próximo `week_day`); null si venció. */
export function nextRun(rule: RuleSchedule, today: string): string | null {
  const first = addDays(today, 1)
  // 31 días cubren el próximo día 1 y los próximos 7 cubren cualquier week_day; se buscan hasta 62 por si la
  // regla empieza más adelante dentro de ese tramo.
  for (let i = 0; i < 62; i++) {
    const day = addDays(first, i)
    if (rule.endDate && day > rule.endDate.slice(0, 10)) return null
    if (isRunDay(rule, day)) return day
  }
  // Start date muy adelante: la primera corrida a partir de ahí.
  const start = rule.startDate.slice(0, 10)
  if (start > first) {
    for (let i = 0; i < 31; i++) {
      const day = addDays(start, i)
      if (isRunDay(rule, day)) return day
    }
  }
  return null
}

/** Cuántas corridas tiene la regla en `today + 1 .. today + days`. */
export function runsInNextDays(rule: RuleSchedule, today: string, days: number): number {
  let runs = 0
  for (let i = 1; i <= days; i++) {
    if (isRunDay(rule, addDays(today, i))) runs++
  }
  return runs
}

/** Estimated monthly: Amount × 1 mensual, × 52/12 semanal (en centavos, redondeado). */
export function estimatedMonthlyCents(rule: RuleSchedule, amountCents: number): number {
  if (Number(rule.frequency) === RULE_FREQUENCY_WEEKLY) return Math.round((amountCents * 52) / 12)
  return amountCents
}
