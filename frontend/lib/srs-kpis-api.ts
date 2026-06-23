// Tipos = DTOs del backend NestJS (src/srs/*/dto). Datos REALES (no mock).

export interface ProductionKpi {
  woCompleted: number
  productionValue: number
  avgCycleHours: number
  onTimePct: number
  openBacklog: number
  backlogOver7d: number
  pendingApproval: number
  avgApprovalHours: number
  inspectionFailPct: number
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

async function getKpi<T>(vertical: string, fechaDesde: string, fechaHasta: string): Promise<T> {
  const qs = `?fechaDesde=${encodeURIComponent(fechaDesde)}&fechaHasta=${encodeURIComponent(fechaHasta)}`
  const res = await fetch(`/api/srs-kpis/kpis/${vertical}${qs}`, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`KPI ${vertical} (${res.status})`)
  }
  return res.json() as Promise<T>
}

export const fetchProductionKpi = (d: string, h: string) => getKpi<ProductionKpi>('production', d, h)
export const fetchBillingKpi = (d: string, h: string) => getKpi<BillingKpi>('billing', d, h)
export const fetchCollectionsKpi = (d: string, h: string) => getKpi<CollectionsKpi>('collections', d, h)
export const fetchPunchKpi = (d: string, h: string) => getKpi<PunchKpi>('punch', d, h)
export const fetchPayrollKpi = (d: string, h: string) => getKpi<PayrollKpi>('payroll', d, h)
