// Tipos espejo del contrato del Nest (plans/plan-expenses-pro/AVANCE.md): todo bajo
// /api/srs/expenses, consumido por el proxy /api/srs-kpis/expenses/... Montos como string con dos
// decimales, fechas YYYY-MM-DD, ids numéricos, paginación `page` base 1.

export type NamedRef = { id: number; name: string }

export type ExpenseStatus = 'pending' | 'approved' | 'rejected'
export type ExpenseMode = 'single' | 'equal' | 'percent' | 'amount'
export type GroupSplitType = 'equal' | 'percent' | 'amount'

export interface ExpenseSingleRow {
  kind: 'single'
  id: number
  ticketDate: string
  company: NamedRef
  category: NamedRef
  dealer: NamedRef
  amount: string
  author: NamedRef
  createdBy: NamedRef
  status: ExpenseStatus
  approvedBy?: { id: number; name: string; date: string } | null
  description: string | null
  receiptNumber: string | null
  notes: string
  deleted: boolean
  hasLog: boolean
  hasAttachment: boolean
  idExpRepetitive?: number | null
  /** Fila de un grupo: el id del grupo (lo manda el Nest en las hijas). */
  groupId?: number | null
  /** Fila de un grupo By percentage: su porcentaje, si el Nest lo manda (si no, se deriva). */
  percentage?: string | null
}

export interface ExpenseGroupRow {
  kind: 'group'
  groupId: number
  splitType: GroupSplitType
  ticketDate: string
  company: NamedRef
  category: NamedRef
  visibleTotal: string
  visibleRows: number
  totalRows: number
  readOnly: boolean
  status: ExpenseStatus
  approvedCount: number
  /** Filas visibles rechazadas; pendientes = visibleRows - approvedCount - rejectedCount. */
  rejectedCount: number
  author: NamedRef
  createdBy: NamedRef
  description: string | null
  receiptNumber: string | null
  notes: string
  deleted: boolean
  hasLog: boolean
  hasAttachment: boolean
  attachmentExpenseId?: number | null
  idExpRepetitive?: number | null
  rows: ExpenseSingleRow[]
}

export type ExpenseRow = ExpenseSingleRow | ExpenseGroupRow
export type ExpenseDetail = ExpenseRow

export interface Paginated<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

export interface ExpenseListFilters {
  from?: string
  to?: string
  /** csv de ids: siempre con ids («All» = todos los del combo). */
  idDealer?: string
  idCompany?: number
  idCategory?: number
  idAuthor?: number
  idCreatedBy?: number
  status?: ExpenseStatus | ''
  amountMin?: string
  amountMax?: string
  deleted?: 0 | 1
}

export interface ExpenseListParams extends ExpenseListFilters {
  /** 1-based. */
  page: number
  pageSize?: number
  sort?: string
  dir?: 'asc' | 'desc'
}

export interface ExpenseSummary {
  total: string
  count: number
  average: string
  topCategory?: { id: number; name: string; total: string } | null
}

export interface ExpenseBranchInput {
  idDealer: number
  percentage?: string
  amount?: string
}

export interface CreateExpensePayload {
  ticketDate: string
  idCompany?: number
  newCompanyName?: string
  idCategory?: number
  newCategoryName?: string
  description?: string
  receiptNumber?: string
  notes?: string
  idAuthor?: number
  mode: ExpenseMode
  idDealer?: number
  totalAmount?: string
  branches?: ExpenseBranchInput[]
  idExpRepetitive?: number
}

/**
 * Edición de un grupo con alguna fila aprobada: el cuerpo lleva SOLO los textos (sin `branches`,
 * `mode`, `totalAmount`, `idAuthor`, `ticketDate`, `idCompany` ni `idCategory`).
 */
export interface TextOnlyExpensePayload {
  description?: string
  receiptNumber?: string
  notes?: string
}

export type UpdateExpensePayload = (CreateExpensePayload | TextOnlyExpensePayload) & {
  kind: 'single' | 'group'
}

export interface ExpenseLogRow {
  id: number
  date: string
  author: NamedRef
  description: string
  scope: 'expense' | 'group'
  /** Línea de una fila de un grupo: su dealer. */
  dealer: string | null
}

export type AnalyticsGroupBy = 'category' | 'company' | 'dealer'

export interface AnalyticsParams {
  groupBy: AnalyticsGroupBy
  from: string
  to: string
  idDealer: string
  status?: ExpenseStatus | ''
  includeRemovedDealers?: boolean
}

export interface AnalyticsRow {
  id: number
  name: string
  count: number
  total: string
  prevTotal: string
  removed?: boolean
}

export interface AnalyticsResponse {
  total: string
  prevTotal: string
  rows: AnalyticsRow[]
}

export interface ExpenseEmployee {
  id: number
  name: string
}

// Catálogo (GENERIC_DATA 34 compañías / 35 categorías)
export type CatalogKind = 'companies' | 'categories'

export interface CatalogItem {
  id: number
  name: string
  active: boolean
  expensesCount: number
  /** Nada la usa (tampoco gastos borrados, reglas ni compañías que la tengan de última): se puede borrar. */
  deletable: boolean
  /** Solo en compañías (D4): la última categoría con la que se cargó un gasto. */
  lastCategory?: { id: number; name: string; active: boolean } | null
  /** Solo en categorías: Merge solo une categorías con la misma clase (los cierres leen tint y Accident por nombre). */
  closingClass?: 'tint' | 'accident' | null
  /** Solo con `duplicatesOnly`: número de grupo (0, 1, 2…) para alternar el fondo (plan-expenses-posibles-duplicados). */
  duplicateGroup?: number
}

/** Página del listado de Settings; `groups` solo con `duplicatesOnly`. */
export type CatalogPage = Paginated<CatalogItem> & { groups?: number }

/** Respuesta del alta: `existing` si ya había una con ese nombre; `reactivated` si estaba inactiva y se reactivó. */
export type CatalogCreateResult = CatalogItem & { existing: boolean; reactivated: boolean }

/** Lo que pasa a la elegida al unificar (solo lo de la empresa). */
export interface CatalogUsage {
  expenses: number
  deletedExpenses: number
  rules: number
  companies: number
}

export interface CatalogMergeResult {
  target: CatalogItem
  expensesMoved: number
  rulesMoved: number
  companiesUpdated: number
}

export interface CatalogListParams {
  term?: string
  page: number
  pageSize?: number
  activeOnly?: boolean
  /** Solo inactivas (Settings, «Show inactive»). */
  inactiveOnly?: boolean
  /** Solo los nombres parecidos, activas e inactivas (Settings, «Possible duplicates»). */
  duplicatesOnly?: boolean
}

// Recurrentes
export type RuleSplit = 'percent' | 'fixed'
export type RuleFrequency = 'monthly' | 'weekly'

export interface RuleRow {
  id: number
  description: string
  company: NamedRef
  category: NamedRef
  amount: string | null
  splitType: RuleSplit
  frequency: RuleFrequency
  weekDay?: number | null
  startDate: string
  endDate?: string | null
  dealersCount: number
  nextRun?: string | null
  active: boolean
  /** Por qué la regla no va a generar lo que se espera (`ruleWarnings` del back); vacío si se genera completa. */
  warnings?: string[]
}

export interface RuleAssignRow {
  id: number
  dealer: NamedRef
  automatic: boolean
  percentage: string | null
  fixedAmount: string | null
}

export interface RuleDetail extends RuleRow {
  assigns: RuleAssignRow[]
  totalPercent: string | null
  /** Motivo por el que el cron no la genera (checkRun), o null. */
  canRun: string | null
}

export interface RuleListResponse extends Paginated<RuleRow> {
  cards: { activeRules: number; estimatedMonthly: string; next30Days: string }
}

export interface CreateRulePayload {
  description: string
  idCompany?: number
  newCompanyName?: string
  idCategory?: number
  newCategoryName?: string
  amount?: string | null
  splitType: RuleSplit
  frequency: RuleFrequency
  weekDay?: number | null
  startDate: string
  endDate?: string | null
}

export type UpdateRulePayload = Partial<CreateRulePayload>

export interface AssignPayload {
  automatic?: boolean
  percentage?: string
  fixedAmount?: string
  allowAnyTotal?: boolean
}

/* -------------------------------------------------------------------------- */
/* Cliente                                                                     */
/* -------------------------------------------------------------------------- */

export const EXPENSES_BASE_URL = '/api/srs-kpis/expenses'

export interface ValidationError {
  field: string
  message: string
}

/** Error del Nest con el estado HTTP y, en un 400 de validación, el error de cada campo. */
export class ExpensesApiError extends Error {
  readonly status: number
  readonly validationErrors: ValidationError[]
  constructor(message: string, status: number, validationErrors: ValidationError[] = []) {
    super(message)
    this.name = 'ExpensesApiError'
    this.status = status
    this.validationErrors = validationErrors
  }
}

export function isExpensesApiError(err: unknown): err is ExpensesApiError {
  return err instanceof ExpensesApiError
}

/** Nest `HttpException`: `{ statusCode, message, error }` o `DataError` con `validationErrors`. */
async function parseNestError(res: Response, fallback: string): Promise<ExpensesApiError> {
  try {
    const body = (await res.json()) as {
      message?: string | string[]
      validationErrors?: ValidationError[]
    }
    const validationErrors = Array.isArray(body.validationErrors) ? body.validationErrors : []
    let message = fallback
    if (Array.isArray(body.message)) message = body.message.join(', ') || fallback
    else if (typeof body.message === 'string' && body.message.trim()) message = body.message
    else if (validationErrors.length > 0) message = validationErrors[0].message
    return new ExpensesApiError(message, res.status, validationErrors)
  } catch {
    return new ExpensesApiError(fallback, res.status)
  }
}

async function requestJson<T>(url: string, init: RequestInit, fallback: string): Promise<T> {
  const res = await fetch(url, {
    cache: 'no-store',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!res.ok) throw await parseNestError(res, fallback)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    search.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v))
  }
  const s = search.toString()
  return s ? `?${s}` : ''
}

export function buildExpenseListQuery(params: Partial<ExpenseListParams>): string {
  return qs({
    page: params.page,
    pageSize: params.pageSize,
    sort: params.sort,
    dir: params.dir,
    from: params.from,
    to: params.to,
    idDealer: params.idDealer,
    idCompany: params.idCompany,
    idCategory: params.idCategory,
    idAuthor: params.idAuthor,
    idCreatedBy: params.idCreatedBy,
    status: params.status,
    amountMin: params.amountMin,
    amountMax: params.amountMax,
    deleted: params.deleted,
  })
}

export function fetchExpenseList(params: ExpenseListParams): Promise<Paginated<ExpenseRow>> {
  return requestJson(`${EXPENSES_BASE_URL}${buildExpenseListQuery(params)}`, { method: 'GET' }, 'Failed to load expenses')
}

export function fetchExpenseSummary(filters: ExpenseListFilters): Promise<ExpenseSummary> {
  return requestJson(
    `${EXPENSES_BASE_URL}/summary${buildExpenseListQuery(filters)}`,
    { method: 'GET' },
    'Failed to load expenses summary',
  )
}

export const expenseListExportUrl = (filters: ExpenseListFilters) =>
  `${EXPENSES_BASE_URL}/export${buildExpenseListQuery(filters)}`

export function fetchExpense(id: number): Promise<ExpenseDetail> {
  return requestJson(`${EXPENSES_BASE_URL}/${id}`, { method: 'GET' }, 'Failed to load expense')
}

export function createExpense(payload: CreateExpensePayload): Promise<ExpenseDetail> {
  return requestJson(EXPENSES_BASE_URL, { method: 'POST', body: JSON.stringify(payload) }, 'Failed to save expense')
}

export function updateExpense(id: number, payload: UpdateExpensePayload): Promise<ExpenseDetail> {
  return requestJson(`${EXPENSES_BASE_URL}/${id}`, { method: 'PUT', body: JSON.stringify(payload) }, 'Failed to save expense')
}

export function setExpenseApproval(id: number, approved: boolean): Promise<ExpenseDetail> {
  return requestJson(
    `${EXPENSES_BASE_URL}/${id}/approval`,
    { method: 'PUT', body: JSON.stringify({ approved }) },
    'Failed to update expense',
  )
}

export function setGroupApproval(groupId: number, approved: boolean): Promise<ExpenseDetail> {
  return requestJson(
    `${EXPENSES_BASE_URL}/groups/${groupId}/approval`,
    { method: 'PUT', body: JSON.stringify({ approved }) },
    'Failed to update expense',
  )
}

export function deleteExpense(id: number): Promise<void> {
  return requestJson(`${EXPENSES_BASE_URL}/${id}`, { method: 'DELETE' }, 'Failed to delete expense')
}

export function deleteGroup(groupId: number): Promise<void> {
  return requestJson(`${EXPENSES_BASE_URL}/groups/${groupId}`, { method: 'DELETE' }, 'Failed to delete expense')
}

export function restoreExpense(id: number): Promise<ExpenseDetail> {
  return requestJson(`${EXPENSES_BASE_URL}/${id}/restore`, { method: 'POST' }, 'Failed to restore expense')
}

/** Restaura todas las filas borradas visibles del grupo. */
export function restoreGroup(groupId: number): Promise<ExpenseDetail> {
  return requestJson(`${EXPENSES_BASE_URL}/groups/${groupId}/restore`, { method: 'POST' }, 'Failed to restore expense')
}

export function fetchExpenseLog(id: number): Promise<{ data: ExpenseLogRow[] }> {
  return requestJson(`${EXPENSES_BASE_URL}/${id}/log`, { method: 'GET' }, 'Failed to load log')
}

export function buildAnalyticsQuery(params: AnalyticsParams): string {
  return qs({
    groupBy: params.groupBy,
    from: params.from,
    to: params.to,
    idDealer: params.idDealer,
    status: params.status,
    includeRemovedDealers: params.includeRemovedDealers ? 'true' : undefined,
  })
}

export function fetchAnalytics(params: AnalyticsParams): Promise<AnalyticsResponse> {
  return requestJson(`${EXPENSES_BASE_URL}/analytics${buildAnalyticsQuery(params)}`, { method: 'GET' }, 'Failed to load analytics')
}

export const analyticsExportUrl = (params: AnalyticsParams) =>
  `${EXPENSES_BASE_URL}/analytics/export${buildAnalyticsQuery(params)}`

/** Add/Edit: con dealers (csv) → asignados a esos dealers; filtros: sin dealers → toda la empresa. */
export function fetchExpenseEmployees(term: string, idDealer: string | null): Promise<{ results: ExpenseEmployee[] }> {
  return requestJson(
    `${EXPENSES_BASE_URL}/employees${qs({ term, idDealer })}`,
    { method: 'GET' },
    'Failed to search employees',
  )
}

// Catálogo
export function fetchCatalog(kind: CatalogKind, params: CatalogListParams): Promise<CatalogPage> {
  return requestJson(
    `${EXPENSES_BASE_URL}/${kind}${qs({
      term: params.term,
      page: params.page,
      pageSize: params.pageSize,
      activeOnly: params.activeOnly ? 1 : undefined,
      inactiveOnly: params.inactiveOnly ? 1 : undefined,
      duplicatesOnly: params.duplicatesOnly ? 1 : undefined,
    })}`,
    { method: 'GET' },
    'Failed to load catalog',
  )
}

export function createCatalogItem(kind: CatalogKind, name: string): Promise<CatalogCreateResult> {
  return requestJson(`${EXPENSES_BASE_URL}/${kind}`, { method: 'POST', body: JSON.stringify({ name }) }, 'Failed to save')
}

export function deleteCatalogItem(kind: CatalogKind, id: number): Promise<void> {
  return requestJson(`${EXPENSES_BASE_URL}/${kind}/${id}`, { method: 'DELETE' }, 'Failed to delete')
}

export function fetchCatalogUsage(kind: CatalogKind, id: number): Promise<CatalogUsage> {
  return requestJson(`${EXPENSES_BASE_URL}/${kind}/${id}/usage`, { method: 'GET' }, 'Failed to load')
}

export function mergeCatalogItem(kind: CatalogKind, id: number, targetId: number): Promise<CatalogMergeResult> {
  return requestJson(
    `${EXPENSES_BASE_URL}/${kind}/${id}/merge`,
    { method: 'POST', body: JSON.stringify({ targetId }) },
    'Failed to save',
  )
}

export function updateCatalogItem(
  kind: CatalogKind,
  id: number,
  payload: { name?: string; active?: boolean },
): Promise<CatalogItem> {
  return requestJson(`${EXPENSES_BASE_URL}/${kind}/${id}`, { method: 'PUT', body: JSON.stringify(payload) }, 'Failed to save')
}

// Recurrentes
export function fetchRules(params: { term?: string; page: number; pageSize?: number }): Promise<RuleListResponse> {
  return requestJson(
    `${EXPENSES_BASE_URL}/recurring${qs({ term: params.term, page: params.page, pageSize: params.pageSize })}`,
    { method: 'GET' },
    'Failed to load recurring expenses',
  )
}

export function fetchRule(id: number): Promise<RuleDetail> {
  return requestJson(`${EXPENSES_BASE_URL}/recurring/${id}`, { method: 'GET' }, 'Failed to load recurring expense')
}

export function createRule(payload: CreateRulePayload): Promise<RuleDetail> {
  return requestJson(`${EXPENSES_BASE_URL}/recurring`, { method: 'POST', body: JSON.stringify(payload) }, 'Failed to save rule')
}

export function updateRule(id: number, payload: UpdateRulePayload): Promise<RuleDetail> {
  return requestJson(`${EXPENSES_BASE_URL}/recurring/${id}`, { method: 'PUT', body: JSON.stringify(payload) }, 'Failed to save rule')
}

export function deleteRule(id: number): Promise<void> {
  return requestJson(`${EXPENSES_BASE_URL}/recurring/${id}`, { method: 'DELETE' }, 'Failed to delete rule')
}

export function changeRuleSplit(id: number, splitType: RuleSplit): Promise<RuleDetail> {
  return requestJson(
    `${EXPENSES_BASE_URL}/recurring/${id}/split`,
    { method: 'PUT', body: JSON.stringify({ splitType }) },
    'Failed to change the split',
  )
}

export function addRuleDealers(id: number, idDealers: number[], allowAnyTotal: boolean): Promise<RuleDetail> {
  return requestJson(
    `${EXPENSES_BASE_URL}/recurring/${id}/dealers`,
    { method: 'POST', body: JSON.stringify({ idDealers, allowAnyTotal }) },
    'Failed to add dealers',
  )
}

export function updateRuleAssign(id: number, idAssign: number, payload: AssignPayload): Promise<RuleDetail> {
  return requestJson(
    `${EXPENSES_BASE_URL}/recurring/${id}/dealers/${idAssign}`,
    { method: 'PUT', body: JSON.stringify(payload) },
    'Failed to save dealer',
  )
}

export function removeRuleAssign(id: number, idAssign: number, allowAnyTotal: boolean): Promise<RuleDetail> {
  return requestJson(
    `${EXPENSES_BASE_URL}/recurring/${id}/dealers/${idAssign}`,
    { method: 'DELETE', body: JSON.stringify({ allowAnyTotal }) },
    'Failed to remove dealer',
  )
}

export const ruleDealersExportUrl = (id: number) => `${EXPENSES_BASE_URL}/recurring/${id}/dealers/export`
