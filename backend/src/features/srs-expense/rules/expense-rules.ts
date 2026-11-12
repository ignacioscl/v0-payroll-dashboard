/**
 * Reglas del reparto y de los datos de un gasto (Add Expense y Recurring Expenses de SRS Suite Pro).
 *
 * Pareja: frontend/lib/expenses/expense-rules.ts (mismos límites y textos). Los casos compartidos viven en
 * v0-payroll-dashboard/shared/expense-rules-cases.json y los corren expense-rules.spec.ts (jest) y
 * expense-rules.test.ts (vitest).
 *
 * validateAmount, validateManualPercent, validateManualSum, manualFits, distributeAutomatic, totalCents, checkRun,
 * splitAmount, fixedSum y dealersWithoutFixed están portadas línea por línea de
 * public/php/api/modulos/expense/ExpenseRepetitivePercentRules.php (la pareja PHP ↔ JS legacy sigue viva para la
 * pantalla legacy). Los porcentajes y los montos se comparan en centésimos enteros (100.00 % = 10000, $1.00 = 100)
 * para no arrastrar errores de float. Funciones puras, sin Nest.
 */

/**
 * `EXP_EXPENSE.estado`: 1 activo, 0 borrado (se ve en Show deleted y se restaura), 2 fila de un grupo que ya no es parte
 * del gasto (salió al cambiar el reparto o estaba borrada cuando se borró el grupo): queda por el histórico, ninguna
 * pantalla la muestra y no se restaura. Legacy y los reportes piden `estado = 0` o `= 1`, así que no la ven.
 */
export const EXPENSE_ESTADO_RETIRED = 2

export const SPLIT_BY_PERCENT = 1
export const SPLIT_BY_FIXED_AMOUNT = 2

/** Textos exactos del PHP (ExpenseRepetitivePercentRules.php). */
export const MSG_PERCENT_INVALID = 'Enter a percent between 0 and 100 (up to 2 decimals).'
export const MSG_NOT_FOUND = 'Recurring expense not found.'
export const MSG_AMOUNT_INVALID = 'Enter an amount greater than 0 (up to 2 decimals).'
export const MSG_SPLIT_NEEDS_100 = 'The percents must add up to 100% before changing the split.'
export function msgSumOver100(sum: string): string {
  return `Manual percents add up to ${sum}%. They can't exceed 100%.`
}

/** Textos de Add Expense y de la regla (T9 del plan). */
export const MSG_DATE_INVALID = 'Choose a valid date (not in the future).'
export const MSG_AT_LEAST_TWO_BRANCHES = 'Choose at least two dealers.'
export const MSG_CHOOSE_BRANCH = 'Choose a dealer.'
export const MSG_CHOOSE_COMPANY = 'Choose a company.'
export const MSG_CHOOSE_CATEGORY = 'Choose a category.'
export const MSG_ENTER_DESCRIPTION = 'Enter a description.'
export const MSG_CHOOSE_START_DATE = 'Choose a start date.'
export const MSG_CHOOSE_WEEK_DAY = 'Choose the day of the week.'
export const MSG_END_BEFORE_START = 'End date must be on or after the start date.'
export const MSG_NAME_EXISTS = 'This name already exists.'
/** Settings: borrar o unificar una compañía o categoría (plan-expenses-settings, §6, textos aprobados). */
export const MSG_CATALOG_IN_USE = 'It has expenses or recurring rules. Deactivate it or merge it instead.'
export const MSG_MERGE_OTHER_COMPANY = 'Choose another active company.'
export const MSG_MERGE_OTHER_CATEGORY = 'Choose another active category.'
export const MSG_BRANCH_OUT_OF_SCOPE = "You don't have access to this dealer."
export const MSG_SOME_BRANCHES_OUTSIDE = "You don't have access to some of these dealers."
export const MSG_RECEIPT_APPROVED = "The receipt is approved and can't be edited."
export const MSG_ATTACHMENT_BRANCH_LOCKED = "This expense has attachments: the dealer can't be changed."
export const MSG_ENTER_DEALER_AMOUNT = 'Enter the amount for this dealer.'
export function msgPercentsSum(sum: string): string {
  return `Percents add up to ${sum}%. They must add up to 100%.`
}
export function msgTooLong(max: number): string {
  return `Up to ${max} characters.`
}

/** Largos de la base (EXP_EXPENSE, EXP_EXPENSE_REPETITIVE, GENERIC_DATA). */
export const DESCRIPTION_MAX = 255
export const RECEIPT_NUMBER_MAX = 64
export const NOTES_MAX = 512
export const CATALOG_NAME_MAX = 128
export const RULE_DESCRIPTION_MAX = 64

/** Lo que las reglas lanzan: el texto es el que va bajo el campo. */
export class ExpenseRuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExpenseRuleError'
  }
}

/** Un dealer de una regla (EXP_EXPENSE_DEALER_ASSIGN) o una fila del reparto de Add Expense. */
export interface AssignLike {
  id: number
  percentage?: string | number | null
  fixedAmount?: string | number | null
  /** has_automatic_percentaje (1 = Automatic). */
  automatic?: boolean | number | null
}

/** Mapa id de asignación (o de dealer) → importe o porcentaje con dos decimales. */
export type AmountById = Record<string, string>

/** (int)round((float)$value * 100) del PHP. */
export function toCents(value: string | number | null | undefined): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

/** number_format($cents / 100, 2, '.', '') del PHP, sin pasar por float. */
export function fromCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.trunc(cents))
  const whole = Math.floor(abs / 100)
  const rest = abs % 100
  return `${sign}${whole}.${rest < 10 ? '0' : ''}${rest}`
}

function isEmpty(value: string | number | null | undefined): boolean {
  return value === null || value === undefined || value === ''
}

function isAutomatic(a: AssignLike): boolean {
  return a.automatic === true || Number(a.automatic) === 1
}

function hasFixed(a: AssignLike): boolean {
  return !isEmpty(a.fixedAmount)
}

function sortById<T extends AssignLike>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => Number(a.id) - Number(b.id))
}

/**
 * Monto válido (el de un dealer o el Amount de una regla By percent): mayor que 0, hasta dos decimales y hasta
 * 99,999,999.99, que es lo que entra en EXP_EXPENSE.amount. Devuelve el monto con dos decimales.
 */
export function validateAmount(value: string | number | null | undefined): string {
  const str = String(value ?? '').trim()
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(str) || toCents(str) <= 0) {
    throw new ExpenseRuleError(MSG_AMOUNT_INVALID)
  }
  return fromCents(toCents(str))
}

/** El Amount de una regla By fixed amount: la suma de los montos de sus dealers; null si ninguno tiene monto. */
export function fixedSum(assigns: readonly AssignLike[]): string | null {
  let sum: number | null = null
  for (const a of assigns) {
    if (hasFixed(a)) {
      sum = (sum ?? 0) + toCents(a.fixedAmount)
    }
  }
  return sum === null ? null : fromCents(sum)
}

/** Los dealers de una regla By fixed amount que todavía no tienen monto. */
export function dealersWithoutFixed<T extends AssignLike>(assigns: readonly T[]): T[] {
  return assigns.filter((a) => !hasFixed(a))
}

/**
 * La única definición de «este reparto se puede generar». Devuelve el problema, o null si se puede generar.
 */
export function checkRun(
  amount: string | number | null | undefined,
  assigns: readonly AssignLike[],
  splitType: number = SPLIT_BY_PERCENT,
): string | null {
  if (Number(splitType) === SPLIT_BY_FIXED_AMOUNT) {
    const sum = fixedSum(assigns)
    if (sum === null) {
      return 'no dealer has an amount'
    }
    if (toCents(sum) !== toCents(amount)) {
      return `the dealers' amounts add up to ${sum} and the Amount is ${isEmpty(amount) ? 'empty' : amount}`
    }
    return null
  }
  if (!(Number(amount) > 0)) {
    return 'the Amount is empty'
  }
  // Los Automatic con lo que les toca hoy, no con el redondeo viejo grabado (Insurance: 15 × 6.67 = 100.05 %).
  const total = totalCents(withAutomaticRecalculated(assigns))
  if (total !== 10000) {
    return `percents add up to ${
      total === null ? 'an incomplete value (a dealer has no percent)' : `${fromCents(total)}%`
    }`
  }
  return null
}

/** Porcentaje Manual válido: número de 0 a 100 con hasta dos decimales. Vacío no vale. Devuelve centésimos. */
export function validateManualPercent(value: string | number | null | undefined): number {
  const str = String(value ?? '').trim()
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(str)) {
    throw new ExpenseRuleError(MSG_PERCENT_INVALID)
  }
  const cents = toCents(str)
  if (cents > 10000) {
    throw new ExpenseRuleError(MSG_PERCENT_INVALID)
  }
  return cents
}

function manualCents(assigns: readonly AssignLike[]): number {
  let sum = 0
  for (const a of assigns) {
    if (!isAutomatic(a) && !isEmpty(a.percentage)) {
      sum += toCents(a.percentage)
    }
  }
  return sum
}

/** Los Manual no pueden sumar más de 100 % (la lista completa, con el cambio ya aplicado en memoria). */
export function validateManualSum(assigns: readonly AssignLike[]): void {
  const sum = manualCents(assigns)
  if (sum > 10000) {
    throw new ExpenseRuleError(msgSumOver100(fromCents(sum)))
  }
}

/** Los Manual suman 100 % o menos: hay un reparto Automatic posible. */
export function manualFits(assigns: readonly AssignLike[]): boolean {
  return manualCents(assigns) <= 10000
}

/**
 * Porcentaje de cada Automatic: lo que dejan los Manual, en partes iguales; el último (por id) se lleva el resto
 * del redondeo para que el reparto sume exactamente 100.00 %. Devuelve id de asignación → porcentaje.
 */
export function distributeAutomatic(assigns: readonly AssignLike[]): AmountById {
  const autos = sortById(assigns.filter((a) => isAutomatic(a)))
  if (autos.length === 0) return {}
  const left = Math.max(0, 10000 - manualCents(assigns))
  const each = Math.floor(left / autos.length)
  const res: AmountById = {}
  autos.forEach((a, i) => {
    const cents = i === autos.length - 1 ? left - each * (autos.length - 1) : each
    res[String(a.id)] = fromCents(cents)
  })
  return res
}

/**
 * Los dealers con el porcentaje que hoy les da `distributeAutomatic` a los Automatic; los Manual quedan como están.
 * Los Automatic grabados con el redondeo viejo del legacy (Insurance: 15 × 6.67 = 100.05 %) no suman 100 hasta el
 * próximo cambio del reparto; `checkRun` y `splitAmount` (el cron, el cambio de Split, el export) los usan recalculados.
 */
export function withAutomaticRecalculated<T extends AssignLike>(assigns: readonly T[]): T[] {
  const auto = distributeAutomatic(assigns)
  return assigns.map((a) => (String(a.id) in auto ? { ...a, percentage: auto[String(a.id)] } : a))
}

/** Suma de todos los porcentajes en centésimos; null si algún dealer no tiene porcentaje (lo usa el cron). */
export function totalCents(assigns: readonly AssignLike[]): number | null {
  let sum = 0
  for (const a of assigns) {
    if (isEmpty(a.percentage)) return null
    sum += toCents(a.percentage)
  }
  return sum
}

/**
 * Importe de cada dealer en una corrida: cada uno lleva su parte redondeada hacia abajo a centavos y los centavos
 * que sobran van al dealer de porcentaje más alto (si empatan, el de id más alto), así la corrida suma exactamente
 * el Amount y ningún importe queda negativo (un 0 % recibe 0.00). By fixed amount: cada dealer con monto recibe su
 * monto; los que no tienen no aparecen.
 */
export function splitAmount(
  amount: string | number | null | undefined,
  assigns: readonly AssignLike[],
  splitType: number = SPLIT_BY_PERCENT,
): AmountById {
  if (Number(splitType) === SPLIT_BY_FIXED_AMOUNT) {
    const res: AmountById = {}
    for (const a of assigns) {
      if (hasFixed(a)) res[String(a.id)] = fromCents(toCents(a.fixedAmount))
    }
    return res
  }
  const sorted = sortById(withAutomaticRecalculated(assigns))
  const total = toCents(amount)
  let given = 0
  const cents: Record<string, number> = {}
  let bigger: AssignLike | null = null
  for (const a of sorted) {
    const pct = toCents(a.percentage)
    cents[String(a.id)] = Math.floor((total * pct) / 10000)
    given += cents[String(a.id)]
    if (bigger === null || pct >= toCents(bigger.percentage)) {
      bigger = a
    }
  }
  if (bigger !== null) {
    cents[String(bigger.id)] += total - given
  }
  const res: AmountById = {}
  for (const id of Object.keys(cents)) res[id] = fromCents(cents[id])
  return res
}

/**
 * Add Expense › Equal: el total en centavos repartido en partes iguales (floor a cada uno) y los centavos que
 * sobran uno a cada uno empezando por el id más alto. Reparte exacto y nunca negativo.
 */
export function splitEqual(total: number, ids: readonly number[]): AmountById {
  const sorted = [...ids].map(Number).sort((a, b) => a - b)
  const res: AmountById = {}
  if (sorted.length === 0) return res
  const totalCents = Math.max(0, Math.trunc(total))
  const each = Math.floor(totalCents / sorted.length)
  const rest = totalCents - each * sorted.length
  sorted.forEach((id, i) => {
    const extra = i >= sorted.length - rest ? 1 : 0
    res[String(id)] = fromCents(each + extra)
  })
  return res
}

export interface PercentRow {
  id: number
  percentage?: string | number | null
}

/**
 * Add Expense › By percentage: al menos dos dealers, cada porcentaje 0–100 con dos decimales y la suma exacta
 * 100,00. Devuelve las filas con su porcentaje normalizado.
 */
export function validatePercentSplit(rows: readonly PercentRow[]): { id: number; percentage: string }[] {
  if (rows.length < 2) throw new ExpenseRuleError(MSG_AT_LEAST_TWO_BRANCHES)
  const out = rows.map((r) => ({ id: Number(r.id), percentage: fromCents(validateManualPercent(r.percentage)) }))
  const sum = out.reduce((acc, r) => acc + toCents(r.percentage), 0)
  if (sum !== 10000) throw new ExpenseRuleError(msgPercentsSum(fromCents(sum)))
  return out
}

export interface AmountRow {
  id: number
  amount?: string | number | null
}

/**
 * Add Expense › By amount: al menos dos dealers, cada monto válido; el Total amount es la suma. Devuelve las filas
 * normalizadas y el total.
 */
export function validateAmountSplit(rows: readonly AmountRow[]): {
  rows: { id: number; amount: string }[]
  total: string
} {
  if (rows.length < 2) throw new ExpenseRuleError(MSG_AT_LEAST_TWO_BRANCHES)
  const out = rows.map((r) => ({ id: Number(r.id), amount: validateAmount(r.amount) }))
  const total = out.reduce((acc, r) => acc + toCents(r.amount), 0)
  return { rows: out, total: fromCents(total) }
}

/** `YYYY-MM-DD` con un día que existe (2026-02-30 no). Sin pasar por la zona horaria. */
export function isRealYmd(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return false
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1) return false
  const date = new Date(Date.UTC(2000, mo - 1, d))
  // Año aparte: Date.UTC trata 0–99 como 1900–1999 y acá entran fechas como 0202-09-15 (están en la base).
  const daysInMonth = new Date(Date.UTC(2000, mo, 0)).getUTCDate()
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
  const max = mo === 2 ? (leap ? 29 : 28) : daysInMonth
  return date.getUTCMonth() === mo - 1 && d <= max
}

/** Receipt date: fecha real, no posterior a hoy (hora de New York, D9). Sin piso: legacy no lo tiene. */
export function validateReceiptDate(ymd: string | null | undefined, todayNy: string): string {
  if (!isRealYmd(ymd) || (ymd as string) > todayNy) {
    throw new ExpenseRuleError(MSG_DATE_INVALID)
  }
  return ymd as string
}

/** Regla: Start date obligatoria y real; End date opcional, real y no anterior a Start. */
export function validateRuleDates(
  start: string | null | undefined,
  end: string | null | undefined,
): { start: string; end: string | null } {
  if (!isRealYmd(start)) throw new ExpenseRuleError(MSG_CHOOSE_START_DATE)
  if (end === null || end === undefined || end === '') return { start: start as string, end: null }
  if (!isRealYmd(end) || (end as string) < (start as string)) {
    throw new ExpenseRuleError(MSG_END_BEFORE_START)
  }
  return { start: start as string, end: end as string }
}

/** Largo máximo de un texto (vacío vale). Devuelve el texto recortado de espacios de borde. */
export function validateLength(value: string | null | undefined, max: number): string {
  const str = String(value ?? '').trim()
  if (str.length > max) throw new ExpenseRuleError(msgTooLong(max))
  return str
}

/** Hoy en New York como `YYYY-MM-DD` (la fecha tope de Receipt date, D9). */
export function todayNy(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}
