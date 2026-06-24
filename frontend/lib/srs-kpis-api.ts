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
}

export interface CollectionsKpi {
  outstandingAr: number
  dsoDays: number
  collectedValue: number
  collectionRatePct: number
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
export const fetchCollectionsKpi = (params: KpiQueryParams) =>
  getKpi<CollectionsKpi>('collections', params)
export const fetchPunchKpi = (params: KpiQueryParams) => getKpi<PunchKpi>('punch', params)
export const fetchPayrollKpi = (params: KpiQueryParams) => getKpi<PayrollKpi>('payroll', params)
