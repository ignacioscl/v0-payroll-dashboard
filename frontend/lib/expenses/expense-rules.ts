/**
 * Reglas del reparto de un gasto entre dealers y de los datos de un gasto (Expenses en Pro).
 *
 * Pareja: backend/src/features/srs-expense/rules/expense-rules.ts (mismos límites y textos).
 * Portado línea por línea de public/php/api/modulos/expense/ExpenseRepetitivePercentRules.php
 * (y su pareja JS public/modulos/expenses/js/expense_repetitive_percent_rules.js).
 *
 * Los porcentajes y los montos se comparan en centésimos enteros (100.00 % = 10000; $1.00 = 100)
 * para no arrastrar errores de float. Casos compartidos: shared/expense-rules-cases.json.
 */

export const SPLIT_BY_PERCENT = 1
export const SPLIT_BY_FIXED_AMOUNT = 2

export type RuleSplitType = typeof SPLIT_BY_PERCENT | typeof SPLIT_BY_FIXED_AMOUNT

export const EXPENSE_RULE_MESSAGES = {
  percentInvalid: 'Enter a percent between 0 and 100 (up to 2 decimals).',
  sumOver100: "Manual percents add up to {sum}%. They can't exceed 100%.",
  notFound: 'Recurring expense not found.',
  amountInvalid: 'Enter an amount greater than 0 (up to 2 decimals).',
  splitNeeds100: 'The percents must add up to 100% before changing the split.',
  percentsMustBe100: 'Percents add up to {sum}%. They must add up to 100%.',
  atLeastTwoBranches: 'Choose at least two dealers.',
  receiptDateInvalid: 'Choose a valid date (not in the future).',
  startDateRequired: 'Choose a start date.',
  endBeforeStart: 'End date must be on or after the start date.',
  upToChars: 'Up to {n} characters.',
} as const

/** Largos de la base: EXP_EXPENSE.description/receipt_number/notes, GENERIC_DATA.name, EXP_EXPENSE_REPETITIVE.description. */
export const EXPENSE_LIMITS = {
  description: 255,
  receiptNumber: 64,
  notes: 512,
  catalogName: 128,
  ruleDescription: 64,
} as const

/** Error de una regla: `field` dice bajo qué campo va el mensaje. */
export class ExpenseRuleError extends Error {
  readonly field?: string
  constructor(message: string, field?: string) {
    super(message)
    this.name = 'ExpenseRuleError'
    this.field = field
  }
}

/** Dealer de una regla recurrente (EXP_EXPENSE_DEALER_ASSIGN), lo mínimo que las reglas leen. */
export interface RuleAssign {
  id: number
  percentage: string | null
  fixedAmount: string | null
  /** has_automatic_percentaje */
  automatic: boolean
}

function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`))
}

export function toCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0
  return Math.round(Number(value) * 100)
}

export function fromCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const whole = Math.floor(abs / 100)
  const rest = abs % 100
  return `${sign}${whole}.${rest < 10 ? '0' : ''}${rest}`
}

const AMOUNT_RE = /^\d{1,8}(\.\d{1,2})?$/
const PERCENT_RE = /^\d{1,3}(\.\d{1,2})?$/

/**
 * Monto válido (el de un dealer, el Total amount o el Amount de una regla By percent): mayor que 0,
 * hasta dos decimales y hasta 99,999,999.99 (EXP_EXPENSE.amount decimal(10,2)).
 * @returns el monto con dos decimales
 */
export function validateAmount(value: unknown, field?: string): string {
  const str = String(value ?? '').trim()
  if (!AMOUNT_RE.test(str) || toCents(str) <= 0) {
    throw new ExpenseRuleError(EXPENSE_RULE_MESSAGES.amountInvalid, field)
  }
  return fromCents(toCents(str))
}

export function isValidAmount(value: unknown): boolean {
  try {
    validateAmount(value)
    return true
  } catch {
    return false
  }
}

function hasFixed(a: RuleAssign): boolean {
  return a.fixedAmount !== null && a.fixedAmount !== undefined && a.fixedAmount !== ''
}

/** El Amount de una regla By fixed amount: la suma de los montos de sus dealers (null si ninguno tiene). */
export function fixedSum(assigns: RuleAssign[]): string | null {
  let sum: number | null = null
  for (const a of assigns) {
    if (hasFixed(a)) sum = (sum ?? 0) + toCents(a.fixedAmount)
  }
  return sum === null ? null : fromCents(sum)
}

/** Los dealers de una regla By fixed amount que todavía no tienen monto. */
export function dealersWithoutFixed(assigns: RuleAssign[]): RuleAssign[] {
  return assigns.filter((a) => !hasFixed(a))
}

/**
 * La única definición de «este reparto se puede generar». Un dealer sin monto no es un problema: se
 * genera para los que tienen.
 * @returns el problema, o null si se puede generar
 */
export function checkRun(
  amount: string | number | null | undefined,
  assigns: RuleAssign[],
  splitType: RuleSplitType = SPLIT_BY_PERCENT,
): string | null {
  if (splitType === SPLIT_BY_FIXED_AMOUNT) {
    const sum = fixedSum(assigns)
    if (sum === null) return 'no dealer has an amount'
    if (toCents(sum) !== toCents(amount)) {
      return `the dealers' amounts add up to ${sum} and the Amount is ${
        amount === null || amount === undefined || amount === '' ? 'empty' : amount
      }`
    }
    return null
  }
  if (!(Number(amount) > 0)) return 'the Amount is empty'
  const total = totalCents(withAutomaticRecalculated(assigns))
  if (total !== 10000) {
    return `percents add up to ${
      total === null ? 'an incomplete value (a dealer has no percent)' : `${fromCents(total)}%`
    }`
  }
  return null
}

/**
 * Porcentaje Manual válido: número de 0 a 100 con hasta dos decimales. Vacío no vale.
 * @returns el porcentaje en centésimos
 */
export function validateManualPercent(value: unknown, field?: string): number {
  const str = String(value ?? '').trim()
  if (!PERCENT_RE.test(str)) throw new ExpenseRuleError(EXPENSE_RULE_MESSAGES.percentInvalid, field)
  const cents = toCents(str)
  if (cents > 10000) throw new ExpenseRuleError(EXPENSE_RULE_MESSAGES.percentInvalid, field)
  return cents
}

export function isValidPercent(value: unknown): boolean {
  try {
    validateManualPercent(value)
    return true
  } catch {
    return false
  }
}

function manualCents(assigns: RuleAssign[]): number {
  let sum = 0
  for (const a of assigns) {
    if (!a.automatic && a.percentage !== null && a.percentage !== undefined && a.percentage !== '') {
      sum += toCents(a.percentage)
    }
  }
  return sum
}

/** Los Manual no pueden sumar más de 100 % (la lista completa, con el cambio ya aplicado en memoria). */
export function validateManualSum(assigns: RuleAssign[], field?: string): void {
  const sum = manualCents(assigns)
  if (sum > 10000) {
    throw new ExpenseRuleError(fill(EXPENSE_RULE_MESSAGES.sumOver100, { sum: fromCents(sum) }), field)
  }
}

/** Los Manual suman 100 % o menos: hay un reparto Automatic posible. */
export function manualFits(assigns: RuleAssign[]): boolean {
  return manualCents(assigns) <= 10000
}

/**
 * Porcentaje de cada Automatic: lo que dejan los Manual, en partes iguales; el último (por id) se
 * lleva el resto del redondeo para que el reparto sume exactamente 100.00 %.
 * @returns id de asignación => porcentaje (string con dos decimales)
 */
export function distributeAutomatic(assigns: RuleAssign[]): Record<number, string> {
  const autos = assigns.filter((a) => a.automatic).sort((a, b) => a.id - b.id)
  if (autos.length === 0) return {}
  const left = Math.max(0, 10000 - manualCents(assigns))
  const each = Math.floor(left / autos.length)
  const res: Record<number, string> = {}
  autos.forEach((a, i) => {
    const cents = i === autos.length - 1 ? left - each * (autos.length - 1) : each
    res[a.id] = fromCents(cents)
  })
  return res
}

/**
 * Los dealers con el porcentaje que hoy les da `distributeAutomatic` a los Automatic; los Manual quedan como están.
 * Los Automatic grabados con el redondeo viejo del legacy (Insurance: 15 × 6.67 = 100.05 %) no suman 100 hasta el
 * próximo cambio del reparto; `checkRun` y `splitAmount` los usan recalculados, como el cron (pareja del back).
 */
export function withAutomaticRecalculated<T extends Pick<RuleAssign, 'id' | 'percentage'> & { automatic?: boolean }>(
  assigns: T[],
): T[] {
  const auto = distributeAutomatic(assigns.map((a) => ({ fixedAmount: null, ...a, automatic: !!a.automatic })))
  return assigns.map((a) => (a.id in auto ? { ...a, percentage: auto[a.id] } : a))
}

/** Suma de todos los porcentajes en centésimos; null si algún dealer no tiene porcentaje. */
export function totalCents(assigns: RuleAssign[]): number | null {
  let sum = 0
  for (const a of assigns) {
    if (a.percentage === null || a.percentage === undefined || a.percentage === '') return null
    sum += toCents(a.percentage)
  }
  return sum
}

/**
 * Importe de cada dealer en una corrida: cada uno lleva su parte redondeada hacia abajo a centavos y
 * los centavos que sobran van al dealer de porcentaje más alto (si empatan, el de id más alto), así
 * la corrida suma exactamente el Amount y ningún importe queda negativo (un 0 % recibe 0.00).
 * By fixed amount: cada dealer con monto recibe su monto; los que no tienen no aparecen.
 * @returns id de asignación => importe (string con dos decimales)
 */
export function splitAmount(
  amount: string | number,
  assigns: (Pick<RuleAssign, 'id' | 'percentage' | 'fixedAmount'> & { automatic?: boolean })[],
  splitType: RuleSplitType = SPLIT_BY_PERCENT,
): Record<number, string> {
  if (splitType === SPLIT_BY_FIXED_AMOUNT) {
    const res: Record<number, string> = {}
    for (const a of assigns) {
      if (a.fixedAmount !== null && a.fixedAmount !== undefined && a.fixedAmount !== '') {
        res[a.id] = fromCents(toCents(a.fixedAmount))
      }
    }
    return res
  }
  const sorted = withAutomaticRecalculated(assigns).sort((a, b) => a.id - b.id)
  const total = toCents(amount)
  let given = 0
  const cents: Record<number, number> = {}
  let bigger: (typeof sorted)[number] | null = null
  for (const a of sorted) {
    const pct = toCents(a.percentage)
    cents[a.id] = Math.floor((total * pct) / 10000)
    given += cents[a.id]
    if (bigger === null || pct >= toCents(bigger.percentage)) bigger = a
  }
  if (bigger !== null) cents[bigger.id] += total - given
  const res: Record<number, string> = {}
  for (const a of sorted) res[a.id] = fromCents(cents[a.id])
  return res
}

/**
 * Reparto Equal de Add Expense: cada dealer recibe `floor(total / n)` centavos y los centavos que
 * sobran van uno a cada uno desde el id más alto. Reparte exacto y nunca negativo.
 * @returns id de dealer => importe (string con dos decimales)
 */
export function splitEqual(totalCentsValue: number, ids: number[]): Record<number, string> {
  const res: Record<number, string> = {}
  if (ids.length === 0) return res
  const sorted = [...ids].sort((a, b) => a - b)
  const each = Math.floor(totalCentsValue / sorted.length)
  let rest = totalCentsValue - each * sorted.length
  const cents: Record<number, number> = {}
  for (const id of sorted) cents[id] = each
  for (let i = sorted.length - 1; i >= 0 && rest > 0; i--) {
    cents[sorted[i]] += 1
    rest -= 1
  }
  for (const id of sorted) res[id] = fromCents(cents[id])
  return res
}

/**
 * Porcentaje de cada dealer a partir de sus montos (al pasar de Equal o By amount a By percentage):
 * su parte sobre el total, y lo que el redondeo deja va al de mayor monto (en un empate, el de mayor
 * id), así suman 100.00 y `splitAmount` con esos porcentajes da los mismos montos. Pareja de
 * `derivePercentages` del Nest (`expense-row-assembler.ts`).
 * @returns id => porcentaje (string con dos decimales); vacío si el total es 0
 */
export function percentsFromAmounts(amounts: Record<number, string>): Record<number, string> {
  const ids = Object.keys(amounts).map(Number)
  const total = ids.reduce((acc, id) => acc + toCents(amounts[id]), 0)
  const res: Record<number, string> = {}
  if (total <= 0) return res
  const pct: Record<number, number> = {}
  let sum = 0
  for (const id of ids) {
    pct[id] = Math.round((toCents(amounts[id]) * 10000) / total)
    sum += pct[id]
  }
  const biggest = [...ids].sort((a, b) => toCents(amounts[b]) - toCents(amounts[a]) || b - a)[0]
  pct[biggest] += 10000 - sum
  for (const id of ids) res[id] = fromCents(pct[id])
  return res
}

export interface PercentSplitRow {
  id: number
  percentage: string | null | undefined
}

/**
 * By percentage de Add Expense: al menos dos dealers, cada uno 0–100 con dos decimales y la suma
 * exactamente 100.00. El error lleva `field` = `branches.<id>.percentage` o `branchIds`.
 * @returns id => centésimos
 */
export function validatePercentSplit(rows: PercentSplitRow[]): Record<number, number> {
  if (rows.length < 2) throw new ExpenseRuleError(EXPENSE_RULE_MESSAGES.atLeastTwoBranches, 'branchIds')
  const cents: Record<number, number> = {}
  let sum = 0
  for (const r of rows) {
    cents[r.id] = validateManualPercent(r.percentage, `branches.${r.id}.percentage`)
    sum += cents[r.id]
  }
  if (sum !== 10000) {
    throw new ExpenseRuleError(
      fill(EXPENSE_RULE_MESSAGES.percentsMustBe100, { sum: fromCents(sum) }),
      'branchIds',
    )
  }
  return cents
}

export interface AmountSplitRow {
  id: number
  amount: string | null | undefined
}

/**
 * By amount de Add Expense: al menos dos dealers, cada monto válido; el total es la suma.
 * @returns total en centésimos y cada monto normalizado
 */
export function validateAmountSplit(rows: AmountSplitRow[]): {
  totalCents: number
  total: string
  amounts: Record<number, string>
} {
  if (rows.length < 2) throw new ExpenseRuleError(EXPENSE_RULE_MESSAGES.atLeastTwoBranches, 'branchIds')
  const amounts: Record<number, string> = {}
  let total = 0
  for (const r of rows) {
    amounts[r.id] = validateAmount(r.amount, `branches.${r.id}.amount`)
    total += toCents(amounts[r.id])
  }
  return { totalCents: total, total: fromCents(total), amounts }
}

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    return leap ? 29 : 28
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

/** `YYYY-MM-DD` de un día que existe (sin construir Date: sin zonas horarias). */
export function isRealYmd(value: unknown): boolean {
  const m = YMD_RE.exec(String(value ?? ''))
  if (!m) return false
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo)
}

/** Hoy en Nueva York como `YYYY-MM-DD` (D9: la fecha del recibo se compara con el día de NY). */
export function todayInNewYork(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Receipt date: fecha real, no posterior a hoy (NY). Sin piso: legacy no lo tiene (D9). */
export function validateReceiptDate(ymd: unknown, todayNy: string, field = 'ticketDate'): string {
  const str = String(ymd ?? '').trim()
  if (!isRealYmd(str) || str > todayNy) {
    throw new ExpenseRuleError(EXPENSE_RULE_MESSAGES.receiptDateInvalid, field)
  }
  return str
}

/** Start date obligatoria y real; End date opcional, real y >= Start. */
export function validateRuleDates(start: unknown, end: unknown): { start: string; end: string | null } {
  const s = String(start ?? '').trim()
  if (!isRealYmd(s)) throw new ExpenseRuleError(EXPENSE_RULE_MESSAGES.startDateRequired, 'startDate')
  const e = end === null || end === undefined ? '' : String(end).trim()
  if (e === '') return { start: s, end: null }
  if (!isRealYmd(e) || e < s) throw new ExpenseRuleError(EXPENSE_RULE_MESSAGES.endBeforeStart, 'endDate')
  return { start: s, end: e }
}

/** Largo máximo de un texto (vacío vale cuando `required` es false). */
export function validateLength(
  value: unknown,
  max: number,
  field?: string,
  required = false,
  requiredMessage?: string,
): string {
  const str = String(value ?? '').trim()
  if (required && str === '') throw new ExpenseRuleError(requiredMessage ?? EXPENSE_RULE_MESSAGES.upToChars, field)
  if (str.length > max) throw new ExpenseRuleError(fill(EXPENSE_RULE_MESSAGES.upToChars, { n: max }), field)
  return str
}
