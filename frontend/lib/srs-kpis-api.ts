// Tipos = DTOs del backend NestJS (src/srs/*/dto). Datos REALES (no mock).

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
}

export interface CollectionsKpi {
  outstandingAr: number
  dsoDays: number
  arOver60Pct: number
  openStatements: number
}

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
}

function buildKpiQuery(params: KpiQueryParams): string {
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
  return `?${qs.toString()}`
}

async function getKpi<T>(vertical: string, params: KpiQueryParams): Promise<T> {
  const res = await fetch(`/api/srs-kpis/kpis/${vertical}${buildKpiQuery(params)}`, { cache: 'no-store' })
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
export const fetchBillingKpi = (params: KpiQueryParams) => getKpi<BillingKpi>('billing', params)
export const fetchBillingByWeek = (params: KpiQueryParams) =>
  getKpi<BillingWeekPoint[]>('billing/by-week', params)
export const fetchUnbilledAging = (params: KpiQueryParams) =>
  getKpi<UnbilledAgingBucket[]>('billing/unbilled-aging', params)
export const fetchUnbilledByDealer = (params: KpiQueryParams) =>
  getKpi<UnbilledDealerRow[]>('billing/unbilled-by-dealer', params)
export const fetchBillingPeriodCollection = (params: KpiQueryParams) =>
  getKpi<BillingPeriodCollectionKpi>('billing/period-collection', params)
export const fetchCollectionsKpi = (params: KpiQueryParams) =>
  getKpi<CollectionsKpi>('collections', params)
export const fetchPunchKpi = (params: KpiQueryParams) => getKpi<PunchKpi>('punch', params)
export const fetchPayrollKpi = (params: KpiQueryParams) => getKpi<PayrollKpi>('payroll', params)
