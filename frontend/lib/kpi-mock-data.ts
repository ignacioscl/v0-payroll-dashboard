// =============================================================================
// KPI Mock Data — DEV ONLY
// -----------------------------------------------------------------------------
// Hardcoded, realistic data modeled after the real SRS schema:
//   - WO Production  -> INVOICE (workflow: Waiting/In Process/Pause/In Transit/Done)
//   - Billing        -> INVOICE_STATEMENT (fecha_create, sended, last_sended)
//   - Collections    -> BILLING + BILLING_WO_REL (check payments vs statements)
//   - Punch Quality  -> TTK_EMPLOYEE_WORK (punch_out null, manual_create,
//                       fixed_at/fixed_by, LOG_TTK_EMPLOYEE_WORK deletes)
//   - Payroll Spend  -> type_payment (hourly/piecework/salary/flat rate/daily/
//                       holiday/sick), hourly_rate, OT functions
// When real endpoints exist, replace this module keeping the exported types.
// =============================================================================

export type KpiPeriod = '4w' | '12w'

export type TranslateFn = (
  key: string,
  params?: Record<string, string | number>,
) => string

export const KPI_PERIOD_OPTIONS: { value: KpiPeriod; labelKey: string }[] = [
  { value: '4w', labelKey: 'mockKpis.periodLast4Weeks' },
  { value: '12w', labelKey: 'mockKpis.periodLast12Weeks' },
]

export function getKpiPeriodOptions(t: TranslateFn): { value: KpiPeriod; label: string }[] {
  return KPI_PERIOD_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))
}

// ----------------------------------------------------------------------------
// Weekly time series (12 weeks, ending Jun 8) — used by trend charts
// ----------------------------------------------------------------------------
export interface KpiWeekPoint {
  week: string
  woCompleted: number
  productionValue: number
  invoicedValue: number
  collectedValue: number
  payrollCost: number
  overtimeCost: number
  punches: number
  punchErrors: number
}

export const KPI_WEEKLY_SERIES: KpiWeekPoint[] = [
  { week: 'Mar 23', woCompleted: 1042, productionValue: 54180, invoicedValue: 51900, collectedValue: 47200, payrollCost: 13420, overtimeCost: 1490, punches: 238, punchErrors: 21 },
  { week: 'Mar 30', woCompleted: 1118, productionValue: 58460, invoicedValue: 55300, collectedValue: 49800, payrollCost: 13980, overtimeCost: 1720, punches: 241, punchErrors: 19 },
  { week: 'Apr 6',  woCompleted: 1086, productionValue: 56720, invoicedValue: 57100, collectedValue: 51400, payrollCost: 13750, overtimeCost: 1610, punches: 236, punchErrors: 24 },
  { week: 'Apr 13', woCompleted: 1153, productionValue: 60240, invoicedValue: 58000, collectedValue: 52900, payrollCost: 14210, overtimeCost: 1840, punches: 244, punchErrors: 18 },
  { week: 'Apr 20', woCompleted: 1097, productionValue: 57350, invoicedValue: 56400, collectedValue: 54100, payrollCost: 13890, overtimeCost: 1570, punches: 239, punchErrors: 22 },
  { week: 'Apr 27', woCompleted: 1176, productionValue: 61530, invoicedValue: 59200, collectedValue: 55600, payrollCost: 14480, overtimeCost: 1960, punches: 246, punchErrors: 17 },
  { week: 'May 4',  woCompleted: 1204, productionValue: 63010, invoicedValue: 60800, collectedValue: 56300, payrollCost: 14690, overtimeCost: 2080, punches: 248, punchErrors: 16 },
  { week: 'May 11', woCompleted: 1162, productionValue: 60870, invoicedValue: 61500, collectedValue: 57800, payrollCost: 14380, overtimeCost: 1790, punches: 243, punchErrors: 20 },
  { week: 'May 18', woCompleted: 1228, productionValue: 64310, invoicedValue: 62100, collectedValue: 58400, payrollCost: 14820, overtimeCost: 2140, punches: 250, punchErrors: 15 },
  { week: 'May 25', woCompleted: 1191, productionValue: 62440, invoicedValue: 63400, collectedValue: 59700, payrollCost: 14570, overtimeCost: 1880, punches: 245, punchErrors: 19 },
  { week: 'Jun 1',  woCompleted: 1247, productionValue: 65380, invoicedValue: 64200, collectedValue: 60900, payrollCost: 15010, overtimeCost: 2210, punches: 251, punchErrors: 14 },
  { week: 'Jun 8',  woCompleted: 1263, productionValue: 66150, invoicedValue: 65000, collectedValue: 61800, payrollCost: 15140, overtimeCost: 2260, punches: 252, punchErrors: 13 },
]

export function getKpiSeries(period: KpiPeriod): KpiWeekPoint[] {
  return period === '4w' ? KPI_WEEKLY_SERIES.slice(-4) : KPI_WEEKLY_SERIES
}

// ----------------------------------------------------------------------------
// Executive summary
// ----------------------------------------------------------------------------
export interface ExecutiveSummary {
  productionValue: number
  productionTrend: number
  woCompleted: number
  woTrend: number
  invoicedValue: number
  invoicedTrend: number
  dsoDays: number
  dsoTrend: number
  punchErrorRate: number
  punchErrorTrend: number
  laborCostPct: number
  laborCostTrend: number
}

const EXEC_SUMMARY: Record<KpiPeriod, ExecutiveSummary> = {
  '4w': {
    productionValue: 258280, productionTrend: 4.2,
    woCompleted: 4929, woTrend: 3.6,
    invoicedValue: 254700, invoicedTrend: 4.8,
    dsoDays: 34.2, dsoTrend: -2.9, // lower is better; negative = improving
    punchErrorRate: 6.1, punchErrorTrend: -1.4,
    laborCostPct: 23.0, laborCostTrend: -0.5,
  },
  '12w': {
    productionValue: 730640, productionTrend: 6.8,
    woCompleted: 13967, woTrend: 5.9,
    invoicedValue: 714900, invoicedTrend: 7.3,
    dsoDays: 35.8, dsoTrend: -1.6,
    punchErrorRate: 7.4, punchErrorTrend: -2.2,
    laborCostPct: 23.4, laborCostTrend: -0.8,
  },
}

export function getExecutiveSummary(period: KpiPeriod): ExecutiveSummary {
  return EXEC_SUMMARY[period]
}

// ----------------------------------------------------------------------------
// Tab 1 — WO Production (INVOICE + WORKFLOW + goal report)
// ----------------------------------------------------------------------------
export interface ProductionKpis {
  woCompleted: number
  woCompletedTrend: number
  avgCycleHours: number // fecha_alta -> chg workflow to Done
  onTimePct: number // completed before promise_datetime
  openBacklog: number // Waiting + In Process + Pause + In Transit
  backlogOver7d: number
  pendingApproval: number // approved = 0
  avgApprovalHours: number // fecha_alta -> approved_date
  inspectionFailPct: number // inspected = 0 over inspected not null
}

const PRODUCTION_KPIS: Record<KpiPeriod, ProductionKpis> = {
  '4w': { woCompleted: 4929, woCompletedTrend: 3.6, avgCycleHours: 26.4, onTimePct: 91.2, openBacklog: 437, backlogOver7d: 58, pendingApproval: 64, avgApprovalHours: 9.8, inspectionFailPct: 3.4 },
  '12w': { woCompleted: 13967, woCompletedTrend: 5.9, avgCycleHours: 27.9, onTimePct: 89.7, openBacklog: 437, backlogOver7d: 58, pendingApproval: 64, avgApprovalHours: 11.2, inspectionFailPct: 3.9 },
}

export function getProductionKpis(period: KpiPeriod): ProductionKpis {
  return PRODUCTION_KPIS[period]
}

export type WoStatusKey = 'waiting' | 'inProcess' | 'pause' | 'inTransit'

export interface WoStatusSlice {
  statusKey: WoStatusKey
  count: number
  color: string
}

export const WO_STATUS_PIPELINE: WoStatusSlice[] = [
  { statusKey: 'waiting', count: 182, color: '#f59e0b' },
  { statusKey: 'inProcess', count: 174, color: '#3b82f6' },
  { statusKey: 'pause', count: 36, color: '#8b5cf6' },
  { statusKey: 'inTransit', count: 45, color: '#06b6d4' },
]

export function getWoStatusPipeline(t: TranslateFn): { status: string; count: number; color: string }[] {
  return WO_STATUS_PIPELINE.map((s) => ({
    status: t(`mockKpis.woStatus.${s.statusKey}`),
    count: s.count,
    color: s.color,
  }))
}

export interface DealerProductionRow {
  dealer: string
  wos: number
  value: number
  goal: number
  attainmentPct: number
}

const DEALER_PRODUCTION_12W: DealerProductionRow[] = [
  { dealer: 'Toyota Miami', wos: 2218, value: 118400, goal: 110000, attainmentPct: 107.6 },
  { dealer: 'Honda Fort Lauderdale', wos: 1986, value: 104900, goal: 105000, attainmentPct: 99.9 },
  { dealer: 'BMW Coral Springs', wos: 1684, value: 99800, goal: 92000, attainmentPct: 108.5 },
  { dealer: 'Chevrolet Boca Raton', wos: 1593, value: 84300, goal: 88000, attainmentPct: 95.8 },
  { dealer: 'Ford Hollywood', wos: 1411, value: 73600, goal: 80000, attainmentPct: 92.0 },
  { dealer: 'Audi Davie', wos: 1268, value: 71900, goal: 70000, attainmentPct: 102.7 },
  { dealer: 'Mercedes Plantation', wos: 1142, value: 68200, goal: 72000, attainmentPct: 94.7 },
  { dealer: 'Lexus Weston', wos: 1027, value: 49500, goal: 52000, attainmentPct: 95.2 },
  { dealer: 'Nissan Pompano', wos: 894, value: 36400, goal: 42000, attainmentPct: 86.7 },
  { dealer: 'Infiniti Doral', wos: 744, value: 23640, goal: 30000, attainmentPct: 78.8 },
]

export function getDealerProduction(period: KpiPeriod): DealerProductionRow[] {
  if (period === '12w') return DEALER_PRODUCTION_12W
  return DEALER_PRODUCTION_12W.map((r) => ({
    ...r,
    wos: Math.round(r.wos * 0.353),
    value: Math.round(r.value * 0.353),
    goal: Math.round(r.goal / 3),
    attainmentPct: Math.round((r.attainmentPct + 1.8) * 10) / 10,
  }))
}

// ----------------------------------------------------------------------------
// Tab 2 — Billing (INVOICE_STATEMENT)
// ----------------------------------------------------------------------------
export interface BillingKpis {
  invoicedValue: number
  invoicedTrend: number
  statementsIssued: number
  avgInvoiceValue: number
  unbilledWos: number // WOs Done, not linked to any statement
  unbilledValue: number
  avgDoneToInvoicedDays: number // WO done -> statement fecha_create
  sentPct: number // sended = 1
  unsentStatements: number
}

const BILLING_KPIS: Record<KpiPeriod, BillingKpis> = {
  '4w': { invoicedValue: 254700, invoicedTrend: 4.8, statementsIssued: 312, avgInvoiceValue: 816, unbilledWos: 391, unbilledValue: 20460, avgDoneToInvoicedDays: 4.6, sentPct: 93.6, unsentStatements: 20 },
  '12w': { invoicedValue: 714900, invoicedTrend: 7.3, statementsIssued: 894, avgInvoiceValue: 800, unbilledWos: 391, unbilledValue: 20460, avgDoneToInvoicedDays: 5.1, sentPct: 92.1, unsentStatements: 71 },
}

export function getBillingKpis(period: KpiPeriod): BillingKpis {
  return BILLING_KPIS[period]
}

export type AgingBucketKey = 'days0_7' | 'days8_14' | 'days15_30' | 'days31Plus'

export interface UnbilledAgingBucket {
  bucketKey: AgingBucketKey
  wos: number
  value: number
}

export const UNBILLED_AGING: UnbilledAgingBucket[] = [
  { bucketKey: 'days0_7', wos: 214, value: 11180 },
  { bucketKey: 'days8_14', wos: 98, value: 5140 },
  { bucketKey: 'days15_30', wos: 56, value: 2920 },
  { bucketKey: 'days31Plus', wos: 23, value: 1220 },
]

export function getUnbilledAging(t: TranslateFn): { bucket: string; wos: number; value: number }[] {
  return UNBILLED_AGING.map((b) => ({
    bucket: t(`mockKpis.aging.${b.bucketKey}`),
    wos: b.wos,
    value: b.value,
  }))
}

export interface UnbilledDealerRow {
  dealer: string
  wos: number
  value: number
  oldestDays: number
}

export const UNBILLED_BY_DEALER: UnbilledDealerRow[] = [
  { dealer: 'Ford Hollywood', wos: 84, value: 4690, oldestDays: 38 },
  { dealer: 'Nissan Pompano', wos: 71, value: 3820, oldestDays: 33 },
  { dealer: 'Chevrolet Boca Raton', wos: 62, value: 3340, oldestDays: 26 },
  { dealer: 'Toyota Miami', wos: 57, value: 3050, oldestDays: 14 },
  { dealer: 'Mercedes Plantation', wos: 44, value: 2410, oldestDays: 19 },
  { dealer: 'Infiniti Doral', wos: 38, value: 1890, oldestDays: 41 },
  { dealer: 'Audi Davie', wos: 35, value: 1260, oldestDays: 9 },
]

// ----------------------------------------------------------------------------
// Tab 3 — Collections (BILLING vs INVOICE_STATEMENT)
// ----------------------------------------------------------------------------
export interface CollectionsKpis {
  outstandingAr: number // invoiced, not yet paid
  dsoDays: number // avg statement -> check date
  dsoTrend: number
  collectedValue: number
  collectedTrend: number
  collectionRatePct: number // collected / invoiced in period
  arOver60Pct: number
  openStatements: number
}

const COLLECTIONS_KPIS: Record<KpiPeriod, CollectionsKpis> = {
  '4w': { outstandingAr: 78400, dsoDays: 34.2, dsoTrend: -2.9, collectedValue: 240800, collectedTrend: 5.1, collectionRatePct: 94.5, arOver60Pct: 19.5, openStatements: 96 },
  '12w': { outstandingAr: 78400, dsoDays: 35.8, dsoTrend: -1.6, collectedValue: 665900, collectedTrend: 6.4, collectionRatePct: 93.1, arOver60Pct: 19.5, openStatements: 96 },
}

export function getCollectionsKpis(period: KpiPeriod): CollectionsKpis {
  return COLLECTIONS_KPIS[period]
}

export type ArAgingBucketKey = 'days0_30' | 'days31_60' | 'days61_90' | 'days90Plus'

export interface ArAgingBucket {
  bucketKey: ArAgingBucketKey
  value: number
  statements: number
  color: string
}

export const AR_AGING: ArAgingBucket[] = [
  { bucketKey: 'days0_30', value: 41200, statements: 49, color: '#22c55e' },
  { bucketKey: 'days31_60', value: 21900, statements: 26, color: '#f59e0b' },
  { bucketKey: 'days61_90', value: 9500, statements: 13, color: '#f97316' },
  { bucketKey: 'days90Plus', value: 5800, statements: 8, color: '#ef4444' },
]

export function getArAging(t: TranslateFn): { bucket: string; value: number; statements: number; color: string }[] {
  return AR_AGING.map((b) => ({
    bucket: t(`mockKpis.aging.${b.bucketKey}`),
    value: b.value,
    statements: b.statements,
    color: b.color,
  }))
}

export interface WorstPayerRow {
  dealer: string
  outstanding: number
  avgDaysToPay: number
  oldestOpenDays: number
  openStatements: number
}

export const WORST_PAYERS: WorstPayerRow[] = [
  { dealer: 'Infiniti Doral', outstanding: 11400, avgDaysToPay: 58.3, oldestOpenDays: 112, openStatements: 14 },
  { dealer: 'Ford Hollywood', outstanding: 13800, avgDaysToPay: 51.6, oldestOpenDays: 97, openStatements: 16 },
  { dealer: 'Nissan Pompano', outstanding: 9200, avgDaysToPay: 47.2, oldestOpenDays: 84, openStatements: 11 },
  { dealer: 'Mercedes Plantation', outstanding: 10600, avgDaysToPay: 39.8, oldestOpenDays: 66, openStatements: 12 },
  { dealer: 'Chevrolet Boca Raton', outstanding: 12300, avgDaysToPay: 33.4, oldestOpenDays: 52, openStatements: 15 },
  { dealer: 'Lexus Weston', outstanding: 6900, avgDaysToPay: 28.9, oldestOpenDays: 44, openStatements: 9 },
  { dealer: 'Honda Fort Lauderdale', outstanding: 7600, avgDaysToPay: 24.1, oldestOpenDays: 38, openStatements: 10 },
  { dealer: 'Toyota Miami', outstanding: 6600, avgDaysToPay: 18.7, oldestOpenDays: 29, openStatements: 9 },
]

// ----------------------------------------------------------------------------
// Tab 4 — Punch Quality (TTK_EMPLOYEE_WORK)
// ----------------------------------------------------------------------------
export interface PunchQualityKpis {
  totalPunches: number
  errorRatePct: number
  errorRateTrend: number
  missingPunchOut: number
  missingBreakEnd: number
  manualPunches: number
  adminCorrections: number // fixed_at not null
  avgCorrectionDelayDays: number // punch date -> fixed_at
  deletedPunches: number // LOG_TTK_EMPLOYEE_WORK
}

const PUNCH_KPIS: Record<KpiPeriod, PunchQualityKpis> = {
  '4w': { totalPunches: 998, errorRatePct: 6.1, errorRateTrend: -1.4, missingPunchOut: 22, missingBreakEnd: 13, manualPunches: 17, adminCorrections: 38, avgCorrectionDelayDays: 2.3, deletedPunches: 9 },
  '12w': { totalPunches: 2933, errorRatePct: 7.4, errorRateTrend: -2.2, missingPunchOut: 74, missingBreakEnd: 41, manualPunches: 52, adminCorrections: 121, avgCorrectionDelayDays: 2.8, deletedPunches: 31 },
}

export function getPunchQualityKpis(period: KpiPeriod): PunchQualityKpis {
  return PUNCH_KPIS[period]
}

export type PunchErrorTypeKey = 'missingPunchOut' | 'missingBreakEnd' | 'manualPunch' | 'deletedPunch'

export interface PunchErrorTypeSlice {
  typeKey: PunchErrorTypeKey
  count: number
  color: string
}

export function getPunchErrorBreakdown(period: KpiPeriod, t: TranslateFn): { type: string; count: number; color: string }[] {
  const k = PUNCH_KPIS[period]
  const items: PunchErrorTypeSlice[] = [
    { typeKey: 'missingPunchOut', count: k.missingPunchOut, color: '#ef4444' },
    { typeKey: 'missingBreakEnd', count: k.missingBreakEnd, color: '#f97316' },
    { typeKey: 'manualPunch', count: k.manualPunches, color: '#f59e0b' },
    { typeKey: 'deletedPunch', count: k.deletedPunches, color: '#8b5cf6' },
  ]
  return items.map((item) => ({
    type: t(`mockKpis.punchErrorType.${item.typeKey}`),
    count: item.count,
    color: item.color,
  }))
}

export interface PunchOffenderRow {
  employee: string
  dealer: string
  missingOut: number
  manual: number
  corrected: number
  total: number
}

export const PUNCH_OFFENDERS: PunchOffenderRow[] = [
  { employee: 'Christopher Wilson', dealer: 'Chevrolet Boca Raton', missingOut: 9, manual: 6, corrected: 11, total: 26 },
  { employee: 'Michael Brown', dealer: 'Honda Fort Lauderdale', missingOut: 7, manual: 5, corrected: 9, total: 21 },
  { employee: 'David Martinez', dealer: 'Ford Hollywood', missingOut: 6, manual: 4, corrected: 8, total: 18 },
  { employee: 'Maria Garcia', dealer: 'Toyota Miami', missingOut: 5, manual: 3, corrected: 6, total: 14 },
  { employee: 'Sarah Anderson', dealer: 'Chevrolet Boca Raton', missingOut: 4, manual: 4, corrected: 5, total: 13 },
  { employee: 'Linda Davis', dealer: 'Honda Fort Lauderdale', missingOut: 3, manual: 2, corrected: 5, total: 10 },
  { employee: 'Patricia Rodriguez', dealer: 'Ford Hollywood', missingOut: 2, manual: 3, corrected: 4, total: 9 },
  { employee: 'James Smith', dealer: 'Toyota Miami', missingOut: 2, manual: 1, corrected: 3, total: 6 },
]

// ----------------------------------------------------------------------------
// Tab 5 — Payroll Spend (type_payment + hourly_rate + OT)
// ----------------------------------------------------------------------------
export interface PayrollKpis {
  totalPayroll: number
  payrollTrend: number
  overtimeCost: number
  overtimePct: number
  avgCostPerWo: number
  laborCostPct: number // payroll / production value
  activeEmployees: number
  avgHourlyRate: number
}

const PAYROLL_KPIS: Record<KpiPeriod, PayrollKpis> = {
  '4w': { totalPayroll: 59540, payrollTrend: 2.8, overtimeCost: 8490, overtimePct: 14.3, avgCostPerWo: 12.08, laborCostPct: 23.0, activeEmployees: 25, avgHourlyRate: 14.2 },
  '12w': { totalPayroll: 171340, payrollTrend: 4.1, overtimeCost: 22550, overtimePct: 13.2, avgCostPerWo: 12.27, laborCostPct: 23.4, activeEmployees: 25, avgHourlyRate: 14.1 },
}

export function getPayrollKpis(period: KpiPeriod): PayrollKpis {
  return PAYROLL_KPIS[period]
}

export type PaymentTypeKey = 'hourly' | 'piecework' | 'salary' | 'flatRate' | 'dailyPay' | 'holiday' | 'sickDay'

export interface PaymentTypeSlice {
  typeKey: PaymentTypeKey
  value: number
  color: string
}

export function getPayrollByType(period: KpiPeriod, t: TranslateFn): { type: string; value: number; color: string }[] {
  const total = PAYROLL_KPIS[period].totalPayroll
  const mix: [PaymentTypeKey, number, string][] = [
    ['hourly', 0.52, '#3b82f6'],
    ['piecework', 0.28, '#22c55e'],
    ['salary', 0.09, '#8b5cf6'],
    ['flatRate', 0.06, '#06b6d4'],
    ['dailyPay', 0.03, '#f59e0b'],
    ['holiday', 0.015, '#f97316'],
    ['sickDay', 0.005, '#ef4444'],
  ]
  return mix.map(([typeKey, pct, color]) => ({
    type: t(`mockKpis.paymentType.${typeKey}`),
    value: Math.round(total * pct),
    color,
  }))
}

export interface PayrollDealerRow {
  dealer: string
  hours: number
  otHours: number
  cost: number
  costPerWo: number
  laborPct: number
}

const PAYROLL_BY_DEALER_12W: PayrollDealerRow[] = [
  { dealer: 'Toyota Miami', hours: 1872, otHours: 196, cost: 27890, costPerWo: 12.57, laborPct: 23.6 },
  { dealer: 'Honda Fort Lauderdale', hours: 1764, otHours: 168, cost: 25940, costPerWo: 13.06, laborPct: 24.7 },
  { dealer: 'BMW Coral Springs', hours: 1698, otHours: 224, cost: 25410, costPerWo: 15.09, laborPct: 25.5 },
  { dealer: 'Chevrolet Boca Raton', hours: 1542, otHours: 142, cost: 22130, costPerWo: 13.89, laborPct: 26.3 },
  { dealer: 'Audi Davie', hours: 1386, otHours: 118, cost: 20460, costPerWo: 16.14, laborPct: 28.5 },
  { dealer: 'Ford Hollywood', hours: 1248, otHours: 96, cost: 17280, costPerWo: 12.25, laborPct: 23.5 },
  { dealer: 'Mercedes Plantation', hours: 1124, otHours: 87, cost: 16040, costPerWo: 14.05, laborPct: 23.5 },
  { dealer: 'Lexus Weston', hours: 916, otHours: 64, cost: 12270, costPerWo: 11.95, laborPct: 24.8 },
  { dealer: 'Nissan Pompano', hours: 488, otHours: 21, cost: 6410, costPerWo: 7.17, laborPct: 17.6 },
  { dealer: 'Infiniti Doral', hours: 392, otHours: 14, cost: 5120, costPerWo: 6.88, laborPct: 21.7 },
]

export function getPayrollByDealer(period: KpiPeriod): PayrollDealerRow[] {
  if (period === '12w') return PAYROLL_BY_DEALER_12W
  return PAYROLL_BY_DEALER_12W.map((r) => ({
    ...r,
    hours: Math.round(r.hours * 0.348),
    otHours: Math.round(r.otHours * 0.36),
    cost: Math.round(r.cost * 0.348),
  }))
}
