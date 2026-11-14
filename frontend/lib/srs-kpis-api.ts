// Tipos = DTOs del backend NestJS (src/srs/*/dto). Datos REALES (no mock).

import type { PunchGroupedResponse } from '@/lib/ttk/punch-grouped-types'
import { isSrsBusy, SrsBusyError } from '@/lib/srs-busy-error'
import type { ClosingScope } from '@/lib/reports/monthly-closing-month'
import {
  punchGroupedParamsToSearchParams,
  type PunchGroupedQueryParams,
} from '@/lib/ttk/punch-grouped-filters'
import {
  punchListParamsToSearchParams,
  type PunchExportPrepareBody,
  type PunchListCursor,
  type PunchListQueryParams,
} from '@/lib/ttk/punch-list-filters'
import type { TtkListRow } from '@/lib/ttk/ttk-list-types'
import type {
  DealerRankingExportPrepareBody,
  DealerRankingQueryParams,
  DealerRankingResponse,
} from '@/lib/ttk/dealer-ranking-types'

export interface ProductionKpi {
  woCompleted: number
  productionValue: number
  avgCycleHours: number
  onTimePct: number
  inspectionFailPct: number
}

export interface ProductionWeekPoint {
  weekStart: string
  woCompleted: number
  productionValue: number
}

export interface ProductionDealerRow {
  dealerId: number
  dealer: string
  wos: number
  value: number
  goal: number
  attainmentPct: number
}

export interface BillingKpi {
  invoicedValue: number
  statementsIssued: number
  avgInvoiceValue: number
  unbilledWos: number
  unbilledValue: number
  unbilledServices: number
  unbilledWoTotalValue: number
  avgDoneToInvoicedDays: number
  sentPct: number
  unsentStatements: number
  partialOverlapWoStatements: number
  woInvoicedValue: number
  woInvoicedInRangeValue: number
  woInvoicedOutsideRangeValue: number
  ttkInvoicedValue: number
  ttkInvoicedInRangeValue: number
  ttkInvoicedOutsideRangeValue: number
  genericInvoicedValue: number
  genericInvoicedInRangeValue: number
  genericInvoicedOutsideRangeValue: number
}

/** Ventana hacia atrás del backlog de WOs Done sin facturar (espeja UNBILLED_LOOKBACK_MONTHS del backend). */
export const UNBILLED_LOOKBACK_MONTHS = 6

export interface BillingWeekPoint {
  weekStart: string
  invoicedValue: number
}

export interface UnbilledAgingBucket {
  bucket: string
  wos: number
  value: number
}

export interface UnbilledDealerRow {
  dealerId: number
  dealer: string
  wos: number
  services: number
  value: number
  oldestDays: number
}

export interface BillingPeriodCollectionKpi {
  invoicedValue: number
  statementsIssued: number
  avgInvoiceValue: number
  collectedValue: number
  collectionRatePct: number
  unpaidInPeriodValue: number
  unpaidInPeriodStatements: number
  /**
   * Las mismas líneas que las tres cards facturadas de Income (WO Invoiced: todo el trabajo de WO
   * del rango; TTK y Generic Invoiced: solo invoices enteras en el rango), valoradas como Income.
   * incomeCollectedValue es el número grande de Collected.
   */
  incomeInvoicedValue: number
  incomeCollectedValue: number
  /** incomeCollectedValue por tipo: se redondea cada uno como su tarjeta facturada (Unpaid sin −$1). */
  incomeCollectedWoValue: number
  incomeCollectedTtkValue: number
  incomeCollectedGenericValue: number
  /** Las mismas líneas, con tax y descuento (plata real): los subtítulos de Collected y Unpaid. */
  incomeInvoicedRealValue: number
  incomeCollectedRealValue: number
  incomeCollectionRatePct: number
}

export interface CollectionsKpi {
  outstandingAr: number
  /** The same debt without the tax of the generics. */
  outstandingArNoTax: number
  dsoDays: number
  arOver60Pct: number
  openStatements: number
}

export interface CollectionsByMonthPoint {
  monthStart: string
  woInvoicedValue: number
  ttkInvoicedValue: number
  genericInvoicedValue: number
  woUnbilledValue: number
  producedValue: number
  collectedValue: number
  /** collectedValue by type: rounded like the invoiced series so the pending never shows −$1. */
  woCollectedValue: number
  ttkCollectedValue: number
  genericCollectedValue: number
  pendingCollectionValue: number
  collectionRatePct: number
  /** The same month as real money (tax + discount): only for the Outstanding AR subtitle. */
  woInvoicedRealValue: number
  ttkInvoicedRealValue: number
  genericInvoicedRealValue: number
  collectedRealValue: number
  woCollectedRealValue: number
  ttkCollectedRealValue: number
  genericCollectedRealValue: number
}

export const COLLECTIONS_HISTORY_MONTHS = [4, 6, 8, 10, 12] as const
export type CollectionsHistoryMonths = (typeof COLLECTIONS_HISTORY_MONTHS)[number]

export interface PunchKpi {
  totalPunches: number
  errorRatePct: number
  missingPunchOut: number
  missingBreakEnd: number
  manualPunches: number
  adminCorrections: number
  avgCorrectionDelayDays: number
  deletedPunches: number
}

export interface PayrollKpi {
  totalPayroll: number
  overtimeCost: number
  overtimePct: number
  avgCostPerWo: number
  laborCostPct: number
  activeEmployees: number
  avgHourlyRate: number
}

export interface KpiQueryParams {
  fechaDesde: string
  fechaHasta: string
  idDealer: string
  filterDateDone?: boolean
  /** When true, include zero-value WO/invoice rows (default false, legacy exclude zeros). */
  includeZero?: boolean
  /** «Include removed dealers»: only sent when the switch is on (the backend honours it only for admins). */
  includeRemovedDealers?: boolean
  historyMonths?: CollectionsHistoryMonths
  /** Income by Dealer by service: also the list of vehicles (only sent when true). */
  withVehicles?: boolean
  /** The vehicles of one service: its name, sent whenever it comes, also empty (a service with no name). */
  service?: string
}

export function buildKpiQuery(params: KpiQueryParams): string {
  const qs = new URLSearchParams({
    fechaDesde: params.fechaDesde,
    fechaHasta: params.fechaHasta,
    idDealer: params.idDealer,
  })
  if (params.filterDateDone !== undefined) {
    qs.set('filterDateDone', params.filterDateDone ? 'true' : 'false')
  }
  if (params.includeZero !== undefined) {
    qs.set('includeZero', params.includeZero ? 'true' : 'false')
  }
  if (params.includeRemovedDealers) {
    qs.set('includeRemovedDealers', 'true')
  }
  if (params.historyMonths !== undefined) {
    qs.set('historyMonths', String(params.historyMonths))
  }
  if (params.withVehicles) {
    qs.set('withVehicles', 'true')
  }
  if (params.service !== undefined) {
    qs.set('service', params.service)
  }
  return `?${qs.toString()}`
}

async function getKpi<T>(vertical: string, params: KpiQueryParams): Promise<T> {
  const res = await fetch(`/api/srs-kpis/kpis/${vertical}${buildKpiQuery(params)}`, { cache: 'no-store' })
  if (isSrsBusy(res)) throw new SrsBusyError()
  if (!res.ok) {
    throw new Error(`KPI ${vertical} (${res.status})`)
  }
  return res.json() as Promise<T>
}

export const fetchProductionKpi = (params: KpiQueryParams) =>
  getKpi<ProductionKpi>('production', params)

export const fetchProductionByWeek = (params: KpiQueryParams) =>
  getKpi<ProductionWeekPoint[]>('production/by-week', params)

export const fetchProductionByDealer = (params: KpiQueryParams) =>
  getKpi<ProductionDealerRow[]>('production/by-dealer', params)

/** Excel of Production vs Goal, built by Nest with Report Info (plans/plan-report-info-exports-tablas §5.2). */
export const productionByDealerExportUrl = (params: KpiQueryParams) =>
  `/api/srs-kpis/kpis/production/by-dealer/export${buildKpiQuery(params)}`
export const fetchBillingKpi = (params: KpiQueryParams) => getKpi<BillingKpi>('billing', params)
export const fetchBillingByWeek = (params: KpiQueryParams) =>
  getKpi<BillingWeekPoint[]>('billing/by-week', params)
export const fetchUnbilledAging = (params: KpiQueryParams) =>
  getKpi<UnbilledAgingBucket[]>('billing/unbilled-aging', params)
export const fetchUnbilledByDealer = (params: KpiQueryParams) =>
  getKpi<UnbilledDealerRow[]>('billing/unbilled-by-dealer', params)
/** One dealer of one year of Income by Dealer (`GET kpis/billing/income-by-dealer`). */
export interface IncomeByDealerRow {
  dealerId: number
  dealer: string
  wo: number
  ttk: number
  generic: number
  notInvoiced: number
  income: number
}

export interface IncomeByDealerYear {
  year: number
  fechaDesde: string
  fechaHasta: string
  /** The header range covers only part of the year (YTD or a cropped start). */
  partial: boolean
  total: number
  dealers: IncomeByDealerRow[]
}

export interface IncomeByDealer {
  years: IncomeByDealerYear[]
  grandTotal: number
}

export const fetchIncomeByDealer = (params: KpiQueryParams) =>
  getKpi<IncomeByDealer>('billing/income-by-dealer', params)

/**
 * Income by Dealer by service (`GET kpis/billing/income-by-dealer/services`,
 * plans/plan-income-by-dealer-por-servicio T2/T3). Asked one dealer and one year at a time.
 */
export interface IncomeServicesDealer {
  dealerId: number
  dealer: string
  income: number
  wo: {
    qty: number
    /** Different vehicles (VIN) of the dealer, not the sum of the services. */
    vehicles: number
    income: number
    services: { service: string; qty: number; vehicles: number; income: number }[]
  }
  /** qty null: punches billed in a generic (fixed qty 1, it would count punches). */
  generic: { income: number; lines: { description: string; qty: number | null; income: number }[] }
  ttk: {
    income: number
    /** By employee (the Export reads this). */
    lines: { employee: string; income: number }[]
    /** By invoice, with its employees (plans/plan-income-by-dealer-ttk-y-autos T2). Optional: the Export builds without it. */
    invoices?: IncomeTtkInvoice[]
  }
}

export interface IncomeTtkInvoice {
  nro: string
  dateFrom: string
  dateTo: string
  income: number
  employees: { employee: string; income: number }[]
}

export interface IncomeVehicleRow {
  dealerId: number
  dealer: string
  vin: string
  make: string
  model: string
  carYear: number | null
  services: { service: string; qty: number }[]
  qty: number
  income: number
}

export interface IncomeServicesYear {
  year: number
  fechaDesde: string
  fechaHasta: string
  partial: boolean
  woQty: number
  vehicles: number
  woIncome: number
  otherIncome: number
  income: number
  dealers: IncomeServicesDealer[]
  vehiclesList?: IncomeVehicleRow[]
}

export interface IncomeServicesByDealer {
  years: IncomeServicesYear[]
}

/** One request at a time: each one runs 4 queries on a pool of 5 shared by every company (§8 of the plan). */
let incomeServicesQueue: Promise<unknown> = Promise.resolve()

export function fetchIncomeByDealerServices(params: KpiQueryParams): Promise<IncomeServicesByDealer> {
  const run = incomeServicesQueue.then(() => getKpi<IncomeServicesByDealer>('billing/income-by-dealer/services', params))
  incomeServicesQueue = run.catch(() => undefined)
  return run
}

/** The vehicles of one service of one dealer in one year (plans/plan-income-by-dealer-ttk-y-autos T3). */
export interface IncomeServiceVehicle {
  vin: string
  make: string
  model: string
  carYear: number | null
  wos: string[]
  /** Date of each WO (YYYY-MM-DD), same order as wos: the date the report uses for the period. */
  woDates: string[]
  qty: number
  income: number
}

export interface IncomeServiceVehicles {
  year: number
  fechaDesde: string
  fechaHasta: string
  service: string
  qty: number
  vehicles: number
  income: number
  rows: IncomeServiceVehicle[]
}

/** Same queue as the services of a row: one request at a time. `service` is required (may be ''). */
export function fetchIncomeServiceVehicles(params: KpiQueryParams & { service: string }): Promise<IncomeServiceVehicles> {
  const run = incomeServicesQueue.then(() =>
    getKpi<IncomeServiceVehicles>('billing/income-by-dealer/services/vehicles', params),
  )
  incomeServicesQueue = run.catch(() => undefined)
  return run
}

/**
 * «Include removed dealers» is shown only when this is true: the company of the session has a
 * dealer removed with «Remove» with money in the dates. No dates = whole history.
 */
export interface RemovedDealersAvailableParams {
  fechaDesde?: string
  fechaHasta?: string
  filterDateDone: boolean
}

/** `dealers`: every removed dealer of the company, to mark their rows as «Removed» (§5). */
export interface RemovedDealersAvailable {
  available: boolean
  dealers: { dealerId: number; dealer: string }[]
}

export async function fetchRemovedDealersAvailable(
  params: RemovedDealersAvailableParams,
): Promise<RemovedDealersAvailable> {
  const qs = new URLSearchParams({ filterDateDone: params.filterDateDone ? 'true' : 'false' })
  if (params.fechaDesde && params.fechaHasta) {
    qs.set('fechaDesde', params.fechaDesde)
    qs.set('fechaHasta', params.fechaHasta)
  }
  const res = await fetch(`/api/srs-kpis/kpis/billing/removed-dealers-available?${qs.toString()}`, {
    cache: 'no-store',
  })
  if (isSrsBusy(res)) throw new SrsBusyError()
  if (!res.ok) {
    throw new Error(`KPI billing/removed-dealers-available (${res.status})`)
  }
  return res.json() as Promise<RemovedDealersAvailable>
}
export const fetchBillingPeriodCollection = (params: KpiQueryParams) =>
  getKpi<BillingPeriodCollectionKpi>('billing/period-collection', params)
export const fetchCollectionsKpi = (params: KpiQueryParams) =>
  getKpi<CollectionsKpi>('collections', params)
export const fetchCollectionsByMonth = (params: KpiQueryParams) =>
  getKpi<CollectionsByMonthPoint[]>('collections/by-month', params)
export const fetchPunchKpi = (params: KpiQueryParams) => getKpi<PunchKpi>('punch', params)
export const fetchPayrollKpi = (params: KpiQueryParams) => getKpi<PayrollKpi>('payroll', params)

/** Una fila del desglose de Total Payroll (`GET kpis/payroll/spend`). */
export interface PayrollSpendTypeRow {
  /** GENERIC_DATA.id del tipo de pago (en `overtime`, el tipo Hourly). */
  id: number
  /** Nombre del tipo de pago tal cual está en el sistema. */
  name: string
  concepto: 'ponchada' | 'prorrateo' | 'overtime'
  amount: number
  /** Ponchadas (montos fijos) o empleados (salario / comisión). */
  qty: number
  hours: number
  /** Qué va en «Qty / Hours»: horas, ponchadas, empleados o nada (piecework). */
  measure: 'hours' | 'count' | 'employees' | 'none'
  /** Overtime automático (> 40 h), tipo manual «Overtime» u otro. */
  kind: 'overtime_auto' | 'overtime_manual' | 'hourly' | 'other'
}

/** Tab Payroll Spend: snapshot diario de payroll con las fechas y los dealers del header. */
export interface PayrollSpendKpi {
  /** 1 semanal, 2 quincenal, 3 mensual; null = sin período de pago configurado. */
  paymentMethod: number | null
  periodo: { desde: string; hasta: string }
  /** Primer día con datos (yyyy-MM-dd). */
  dataFrom: string
  totalPayroll: number
  payrollTaxes: number
  overtime: { amount: number; hours: number; employeesOver40: number }
  piecework: number
  /** Piecework de las WO de los empleados con Piecework en su ficha, mismas fechas y dealers, hasta el último día calculado. */
  pieceworkWorkOrders: number
  /** `pieceworkWorkOrders` distinto de `piecework`: la tarjeta abre el detalle. */
  pieceworkHasDifference: boolean
  byType: PayrollSpendTypeRow[]
  employees: number
  /** Salarios sin dealer; null para usuarios restringidos a dealers. */
  withoutDealer: { amount: number; employees: number; byType: PayrollSpendTypeRow[] } | null
  /** Todos los dealers activos pedidos: lo sin dealer ya está sumado en el total. */
  allDealers: boolean
  dealerRestricted: boolean
  /** UTC `yyyy-MM-dd HH:mm:ss` de la última corrida; null si todavía no se calculó. */
  calculatedAt: string | null
}

export const fetchPayrollSpend = (params: KpiQueryParams) =>
  getKpi<PayrollSpendKpi>('payroll/spend', params)

/** Un día, dealer y empleado en que el piecework de las WO difiere del de payroll. */
export interface PayrollPieceworkDiffRow {
  /** yyyy-MM-dd */
  fecha: string
  idDealer: number
  dealer: string
  idUsuario: number
  employee: string
  workOrders: number
  payroll: number
  /** workOrders − payroll. */
  difference: number
  reason: 'other_payment_type' | 'no_piecework_type' | null
  /** Tipos ponchados ese día, para `other_payment_type`. */
  punchTypes: string | null
}

export const fetchPayrollPieceworkDiff = (params: KpiQueryParams) =>
  getKpi<PayrollPieceworkDiffRow[]>('payroll/piecework-diff', params)

export async function readNestJson<T>(res: Response, fallback: string): Promise<T> {
  if (isSrsBusy(res)) throw new SrsBusyError()
  const text = await res.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      if (!res.ok) throw new Error(fallback)
      throw new Error(fallback)
    }
  }
  if (!res.ok) {
    const obj =
      parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    const raw = obj?.message
    let message = fallback
    if (typeof raw === 'string' && raw.trim()) message = raw
    else if (Array.isArray(raw) && raw.length) {
      message = raw.filter(Boolean).join(', ')
    }
    const validations = obj?.validationErrors
    if (Array.isArray(validations) && validations.length) {
      const parts = validations
        .map((item) => {
          if (item && typeof item === 'object' && 'message' in item) {
            return String((item as { message: unknown }).message ?? '')
          }
          return ''
        })
        .filter((part) => part.trim())
      if (parts.length) message = parts.join(', ')
    }
    throw new Error(message)
  }
  return parsed as T
}

export async function fetchPunchGrouped(
  params: PunchGroupedQueryParams,
): Promise<PunchGroupedResponse> {
  const qs = punchGroupedParamsToSearchParams(params)
  const res = await fetch(`/api/srs-kpis/punch/grouped?${qs.toString()}`, { cache: 'no-store' })
  return readNestJson<PunchGroupedResponse>(res, `punch/grouped (${res.status})`)
}

/**
 * Listado individual de ponchadas, paginado por cursor (keyset).
 *
 * Reemplaza a `ttk-list.php` para la tabla de Punch Report: al cortar por contenido
 * y no por posición, las ponchadas que entran mientras se scrollea no corren la
 * ventana y por lo tanto no se repiten ni se saltean filas.
 */
export type PunchListResponse = {
  results: TtkListRow[]
  pageSize: number
  total: number
  hasMore: boolean
  nextCursor: PunchListCursor | null
}

export async function fetchPunchList(
  params: PunchListQueryParams,
): Promise<PunchListResponse> {
  const qs = punchListParamsToSearchParams(params)
  const res = await fetch(`/api/srs-kpis/punch/list?${qs.toString()}`, { cache: 'no-store' })
  return readNestJson<PunchListResponse>(res, `punch/list (${res.status})`)
}

export async function fetchPunchExportPrepare(
  body: PunchExportPrepareBody,
): Promise<{ ticket: string; expiresAt: string }> {
  const res = await fetch('/api/srs-kpis/punch/list/export/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(body),
  })
  return readNestJson<{ ticket: string; expiresAt: string }>(
    res,
    `punch/list/export/prepare (${res.status})`,
  )
}

export async function fetchPunchExportStatus(
  ticket: string,
): Promise<{ status: 'pending' | 'running' | 'done' | 'error'; errorMessage?: string; errorCode?: string }> {
  const qs = new URLSearchParams({ ticket })
  const res = await fetch(`/api/srs-kpis/punch/list/export/status?${qs.toString()}`, {
    cache: 'no-store',
  })
  return readNestJson<{
    status: 'pending' | 'running' | 'done' | 'error'
    errorMessage?: string
    errorCode?: string
  }>(res, `punch/list/export/status (${res.status})`)
}

/**
 * Ranking de dealers del Dashboard: la tarjeta (top 5) y su modal "View all".
 * Trae Pending y Corrected en la misma respuesta: el switch es del cliente.
 */
export async function fetchDealerRanking(
  params: DealerRankingQueryParams,
): Promise<DealerRankingResponse> {
  const qs = new URLSearchParams({
    fechaDesde: params.fechaDesde,
    fechaHasta: params.fechaHasta,
    idDealer: params.idDealer,
  })
  if (params.errorTypes) qs.set('errorTypes', params.errorTypes)
  if (params.search) qs.set('search', params.search)
  const res = await fetch(`/api/srs-kpis/punch/dealer-ranking?${qs.toString()}`, {
    cache: 'no-store',
  })
  return readNestJson<DealerRankingResponse>(res, `punch/dealer-ranking (${res.status})`)
}

/** Export del ranking (Report Info + Dealers + Employees): mismo protocolo de ticket que P4. */
export async function fetchDealerRankingExportPrepare(
  body: DealerRankingExportPrepareBody,
): Promise<{ ticket: string; expiresAt: string }> {
  const res = await fetch('/api/srs-kpis/punch/dealer-ranking/export/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(body),
  })
  return readNestJson<{ ticket: string; expiresAt: string }>(
    res,
    `punch/dealer-ranking/export/prepare (${res.status})`,
  )
}

export async function fetchDealerRankingExportStatus(
  ticket: string,
): Promise<{ status: 'pending' | 'running' | 'done' | 'error'; errorMessage?: string; errorCode?: string }> {
  const qs = new URLSearchParams({ ticket })
  const res = await fetch(`/api/srs-kpis/punch/dealer-ranking/export/status?${qs.toString()}`, {
    cache: 'no-store',
  })
  return readNestJson<{
    status: 'pending' | 'running' | 'done' | 'error'
    errorMessage?: string
    errorCode?: string
  }>(res, `punch/dealer-ranking/export/status (${res.status})`)
}

/* -------------------------------------------------------------------------- */
/* Monthly Closing y Window Tint Closing (`GET srs/reports/monthly-closing`)   */
/* -------------------------------------------------------------------------- */

export interface MonthlyClosingQueryParams {
  /** `YYYY-MM`, validado con lib/reports/monthly-closing-month.ts antes de pedir. */
  month: string
  idDealer: string
  includeRemovedDealers?: boolean
  scope: ClosingScope
}

export interface ClosingPeriod {
  desde: string
  hasta: string
  status: 'complete' | 'partial' | 'notCalculated'
  calculatedThrough: string | null
}

export interface ClosingRow {
  /** 0 = Without dealer. */
  dealerId: number
  dealer: string
  removed: boolean
  /** Window Tint Closing only. */
  vehicles: number | null
  income: number
  payroll: number
  expenses: number
  profit: number
  /** Profit ÷ Income, one decimal; null with Income $0. */
  pct: number | null
  /** Monthly Closing only. */
  accident: number | null
  /** Window Tint Closing only: the Income has services without «tint» in their name (row in red). */
  nonTint: boolean | null
}

export interface MonthlyClosingData {
  scope: ClosingScope
  month: string
  rows: ClosingRow[]
  total: ClosingRow
  withoutDealer: ClosingRow | null
  periods: ClosingPeriod[]
}

export interface ClosingIncomeLine {
  nro: string
  dateFrom: string
  dateTo: string
  department: string
  service: string
  qty: number
  total: number
  /** Window Tint Closing only: «tint» in the service name; null in Monthly Closing. */
  tint: boolean | null
  /** Window Tint Closing only: row in red (no «tint» and an amount other than $0); null in Monthly Closing. */
  warn: boolean | null
}

/** By service of the dealer (Window Tint Closing): the same rows as the «By service» sheet of the Excel. */
export interface ClosingServiceRow {
  department: string
  service: string
  /** Sum of the Qty of the service. */
  vehicles: number
  amount: number
  /** «tint» in the service name. */
  tint: boolean
  /** Row in red: no «tint» and an amount other than $0. */
  warn: boolean
}

export interface ClosingPayrollLine {
  periodDesde: string
  periodHasta: string
  employee: string
  position: string
  amount: number
}

export interface ClosingExpenseLine {
  date: string
  vendor: string
  category: string
  amount: number
  notes: string
}

export interface MonthlyClosingDealerData {
  dealerId: number
  dealer: string
  income: ClosingIncomeLine[]
  /** Window Tint Closing only; null in Monthly Closing. */
  byService: ClosingServiceRow[] | null
  payroll: ClosingPayrollLine[]
  expenses: ClosingExpenseLine[]
}

function monthlyClosingQuery(params: MonthlyClosingQueryParams): string {
  const qs = new URLSearchParams({ month: params.month, idDealer: params.idDealer, scope: params.scope })
  if (params.includeRemovedDealers) qs.set('includeRemovedDealers', 'true')
  return `?${qs.toString()}`
}

export async function fetchMonthlyClosing(params: MonthlyClosingQueryParams): Promise<MonthlyClosingData> {
  const res = await fetch(`/api/srs-kpis/reports/monthly-closing${monthlyClosingQuery(params)}`, { cache: 'no-store' })
  return readNestJson<MonthlyClosingData>(res, `reports/monthly-closing (${res.status})`)
}

/** Las tres listas de un dealer; `idDealer = 0` = Without dealer (solo Payroll). */
export async function fetchMonthlyClosingDealer(
  idDealer: number,
  params: MonthlyClosingQueryParams,
): Promise<MonthlyClosingDealerData> {
  const res = await fetch(
    `/api/srs-kpis/reports/monthly-closing/dealer/${idDealer}${monthlyClosingQuery(params)}`,
    { cache: 'no-store' },
  )
  return readNestJson<MonthlyClosingDealerData>(res, `reports/monthly-closing/dealer (${res.status})`)
}

/** Excel armado por Nest: Report Info, Summary, (By service), Income, Payroll y Expenses. */
export const monthlyClosingExportUrl = (params: MonthlyClosingQueryParams) =>
  `/api/srs-kpis/reports/monthly-closing/export${monthlyClosingQuery(params)}`
