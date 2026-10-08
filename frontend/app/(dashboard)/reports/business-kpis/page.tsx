'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CalendarRange,
  CheckCheck,
  ClipboardCheck,
  Clock,
  DollarSign,
  Factory,
  Fingerprint,
  HandCoins,
  Hourglass,
  Info,
  Landmark,
  Package,
  Pencil,
  Percent,
  Receipt,
  RefreshCw,
  Send,
  Target,
  Timer,
  Trash2,
  TriangleAlert,
  TrendingUp,
  Users,
  Wrench,
  FileBarChart,
  type LucideIcon,
} from 'lucide-react'
import { KPICard } from '@/components/dashboard/kpi-card'
import { ProductionWeekChart } from '@/components/dashboard/production-week-chart'
import { BillingWeekChart } from '@/components/dashboard/billing-week-chart'
import { InvoiceCollectionMonthChart } from '@/components/dashboard/invoice-collection-month-chart'
import { UnbilledAgingChart } from '@/components/dashboard/unbilled-aging-chart'
import { PayrollByTypeChart } from '@/components/dashboard/payroll-by-type-chart'
import { UnbilledByDealerTable } from '@/components/dashboard/unbilled-by-dealer-table'
import { PageHeading } from '@/components/layout/page-heading'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useFilters } from '@/lib/filter-context'
import { formatDateParam } from '@/lib/ttk/map-header-filters'
import { useTranslation, type TranslateFn } from '@/lib/i18n/locale-context'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { canAccessProductionReport, canViewPayrollSpend } from '@/lib/auth/payroll-access'
import { formatUsCalendarDate } from '@/lib/format-us-datetime'
import { cn } from '@/lib/utils'
import {
  fetchBillingKpi,
  fetchBillingByWeek,
  fetchBillingPeriodCollection,
  fetchCollectionsKpi,
  fetchCollectionsByMonth,
  fetchPayrollKpi,
  fetchPayrollSpend,
  fetchProductionKpi,
  fetchProductionByWeek,
  fetchPunchKpi,
  fetchUnbilledAging,
  fetchUnbilledByDealer,
  type BillingKpi,
  COLLECTIONS_HISTORY_MONTHS,
  type CollectionsHistoryMonths,
  type KpiQueryParams,
} from '@/lib/srs-kpis-api'
import { dollars, fmtDollars, shownPending, sumShown } from '@/lib/kpi-money'
import { isSrsBusyError } from '@/lib/srs-busy-error'

const fmtMoney = (n: number | undefined) =>
  n === undefined ? '—' : fmtDollars(n)
const fmtMoneyK = (n: number | undefined) =>
  n === undefined ? '—' : n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`

/** Abreviado en tarjeta ($40.2k); click muestra monto completo ($40,162). */
function kpiMoneyProps(n: number | undefined): { value: string; valueFull?: string } {
  if (n === undefined) return { value: '—' }
  const full = fmtMoney(n)
  if (n >= 1000) return { value: fmtMoneyK(n), valueFull: full }
  return { value: full }
}

function billingSplitSubtitle(
  b: BillingKpi | undefined,
  total: number | undefined,
  inRange: number | undefined,
  t: TranslateFn,
): string {
  if (!b || total === undefined || inRange === undefined) return ''
  const shownOut = dollars(total) - dollars(inRange)
  if (shownOut === 0) {
    return t('mockKpis.billingAllInRange', { inRange: fmtDollars(inRange) })
  }
  return t('mockKpis.billingInRangeOutside', {
    inRange: fmtDollars(inRange),
    outside: fmtDollars(shownOut),
  })
}

/** Hora de la última corrida del snapshot (UTC `yyyy-MM-dd HH:mm:ss`) en New York, formato US. */
const PAYROLL_TIME_ZONE = 'America/New_York'
function formatSnapshotStamp(utc: string): { date: string; time: string } | null {
  const d = new Date(`${utc.replace(' ', 'T')}Z`)
  if (Number.isNaN(d.getTime())) return null
  return {
    date: d.toLocaleDateString('en-US', { timeZone: PAYROLL_TIME_ZONE, month: '2-digit', day: '2-digit', year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { timeZone: PAYROLL_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: true }),
  }
}

const fmtCents = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Montos de Payroll: abreviado en la tarjeta ($745.9k); con un click, completo con centavos ($745,921.78). */
function kpiCentsProps(n: number | undefined): { value: string; valueFull?: string } {
  if (n === undefined) return { value: '—' }
  if (n >= 1000) return { value: fmtMoneyK(n), valueFull: fmtCents(n) }
  return { value: fmtCents(n) }
}

function formatUsDate(date: Date): string {
  return format(date, 'MM/dd/yyyy')
}

function formatUsDateRange(from: Date | undefined, to: Date | undefined): string | null {
  if (!from) return null
  const end = to ?? from
  if (
    from.getFullYear() === end.getFullYear() &&
    from.getMonth() === end.getMonth() &&
    from.getDate() === end.getDate()
  ) {
    return formatUsDate(from)
  }
  return `${formatUsDate(from)} – ${formatUsDate(end)}`
}

// Grilla de cards de una fila: entran tantas columnas como quepan con un mínimo de
// 20rem por card; cuando no hay lugar, la card baja a la fila siguiente en vez de
// apretar el texto. En mobile queda una por fila.
const KPI_CARD_GRID = 'grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))]'

export default function BusinessKpisPage() {
  const { t } = useTranslation()
  const { dateRange, selectedDealers, filtersHydrated } = useFilters()
  const { user, loading: meLoading, hasPermission } = useSrsMe()
  // Cada tab pide lo suyo (decisión C): Production Report (47) las de producción y facturación,
  // Time Tracking > Payroll (93) la de payroll.
  const canSeeProductionTabs = canAccessProductionReport(user, hasPermission)
  const canSeePayroll = canViewPayrollSpend(user, hasPermission)
  const [filterDateDone, setFilterDateDone] = useState(false)
  const [includeZero, setIncludeZero] = useState(false)
  // Las tres tarjetas del resumen muestran solo título y total; un click en cualquiera abre el detalle de las tres.
  const [summaryDetailOpen, setSummaryDetailOpen] = useState(false)
  const toggleSummaryDetail = () => setSummaryDetailOpen((open) => !open)
  const [collectionsHistoryMonths, setCollectionsHistoryMonths] = useState<CollectionsHistoryMonths>(4)
  // WO Production está oculta (sin botón): la pestaña y sus consultas siguen en el
  // código para volver a mostrarla, pero no se pide nada mientras no se elija.
  const [activeTab, setActiveTab] = useState('billing')
  // Quien solo tiene «Time Tracking > Payroll» entra directo en Payroll Spend.
  useEffect(() => {
    if (!meLoading && !canSeeProductionTabs && canSeePayroll) setActiveTab('payroll')
  }, [meLoading, canSeeProductionTabs, canSeePayroll])

  const idDealer = useMemo(() => selectedDealers.join(','), [selectedDealers])

  const headerRange = useMemo(() => {
    const fechaDesde = formatDateParam(dateRange?.from)
    const fechaHasta = formatDateParam(dateRange?.to ?? dateRange?.from)
    return { fechaDesde, fechaHasta }
  }, [dateRange])

  const headerRangeLabel = useMemo(
    () => formatUsDateRange(dateRange?.from, dateRange?.to),
    [dateRange],
  )

  const rangeReady =
    filtersHydrated && selectedDealers.length > 0 && Boolean(headerRange.fechaDesde)

  const headerKpiParams = useMemo((): KpiQueryParams | null => {
    if (!rangeReady) return null
    return {
      fechaDesde: headerRange.fechaDesde,
      fechaHasta: headerRange.fechaHasta,
      idDealer,
      includeZero,
    }
  }, [rangeReady, headerRange, idDealer, includeZero])

  const productionKpiParams = useMemo((): KpiQueryParams | null => {
    if (!headerKpiParams) return null
    return { ...headerKpiParams, filterDateDone }
  }, [headerKpiParams, filterDateDone])

  // Billing lleva el mismo switch que Production: si el Closing filtra las WO por fecha de
  // terminado y acá no, apenas alguien tilde la casilla los dos reportes dejan de coincidir.
  const billingKpiParams = useMemo((): KpiQueryParams | null => {
    if (!headerKpiParams) return null
    return { ...headerKpiParams, filterDateDone }
  }, [headerKpiParams, filterDateDone])

  // Payroll usa las fechas y los dealers del header, como las demás tabs (plan v9: sin combos).
  const payrollKpiParams = useMemo((): KpiQueryParams | null => {
    if (!rangeReady) return null
    return {
      fechaDesde: headerRange.fechaDesde,
      fechaHasta: headerRange.fechaHasta,
      idDealer,
    }
  }, [rangeReady, headerRange, idDealer])

  const prod = useQuery({
    queryKey: ['srs-kpi', 'production', productionKpiParams],
    queryFn: () => fetchProductionKpi(productionKpiParams!),
    // Payroll lo usa para Revenue per Employee.
    enabled: Boolean(productionKpiParams) && (activeTab === 'production' || activeTab === 'payroll'),
  })
  const prodWeek = useQuery({
    queryKey: ['srs-kpi', 'production-by-week', productionKpiParams],
    queryFn: () => fetchProductionByWeek(productionKpiParams!),
    enabled: Boolean(productionKpiParams) && activeTab === 'production',
  })
  const bill = useQuery({
    queryKey: ['srs-kpi', 'billing', billingKpiParams],
    queryFn: () => fetchBillingKpi(billingKpiParams!),
    // Payroll lo usa para Labor Cost / Revenue (Total Payroll ÷ Income).
    enabled: Boolean(billingKpiParams) && (activeTab === 'billing' || activeTab === 'payroll'),
  })
  const billWeek = useQuery({
    queryKey: ['srs-kpi', 'billing-by-week', billingKpiParams],
    queryFn: () => fetchBillingByWeek(billingKpiParams!),
    enabled: Boolean(billingKpiParams) && activeTab === 'billing',
  })
  const unbilledAging = useQuery({
    queryKey: ['srs-kpi', 'unbilled-aging', headerKpiParams],
    queryFn: () => fetchUnbilledAging(headerKpiParams!),
    enabled: Boolean(headerKpiParams) && activeTab === 'billing',
  })
  const unbilledByDealer = useQuery({
    queryKey: ['srs-kpi', 'unbilled-by-dealer', headerKpiParams],
    queryFn: () => fetchUnbilledByDealer(headerKpiParams!),
    // La tabla vive en la pestaña WO Production (oculta): no se pide desde Billing.
    enabled: Boolean(headerKpiParams) && activeTab === 'production',
  })
  const periodColl = useQuery({
    queryKey: ['srs-kpi', 'billing-period-collection', billingKpiParams],
    queryFn: () => fetchBillingPeriodCollection(billingKpiParams!),
    enabled: Boolean(billingKpiParams) && activeTab === 'billing',
  })
  const coll = useQuery({
    queryKey: ['srs-kpi', 'collections', headerKpiParams],
    queryFn: () => fetchCollectionsKpi(headerKpiParams!),
    enabled: Boolean(headerKpiParams) && activeTab === 'collections',
  })
  const collByMonthParams = useMemo((): KpiQueryParams | null => {
    if (!headerKpiParams) return null
    return { ...headerKpiParams, historyMonths: collectionsHistoryMonths }
  }, [headerKpiParams, collectionsHistoryMonths])
  const collByMonth = useQuery({
    queryKey: ['srs-kpi', 'collections-by-month', collByMonthParams],
    queryFn: () => fetchCollectionsByMonth(collByMonthParams!),
    enabled: Boolean(collByMonthParams) && activeTab === 'collections',
  })
  const punch = useQuery({
    queryKey: ['srs-kpi', 'punch', headerKpiParams],
    queryFn: () => fetchPunchKpi(headerKpiParams!),
    enabled: Boolean(headerKpiParams) && activeTab === 'punch',
  })
  const pay = useQuery({
    queryKey: ['srs-kpi', 'payroll', payrollKpiParams],
    queryFn: () => fetchPayrollKpi(payrollKpiParams!),
    enabled: Boolean(payrollKpiParams) && activeTab === 'payroll' && canSeePayroll,
  })
  const spend = useQuery({
    queryKey: ['srs-kpi', 'payroll-spend', payrollKpiParams],
    queryFn: () => fetchPayrollSpend(payrollKpiParams!),
    enabled: Boolean(payrollKpiParams) && activeTab === 'payroll' && canSeePayroll,
  })

  const p = prod.data
  const b = bill.data
  const pc = periodColl.data
  const c = coll.data
  const k = punch.data
  const y = pay.data
  const s = spend.data
  const spendStamp = s?.calculatedAt ? formatSnapshotStamp(s.calculatedAt) : null
  // Active Employees: monto ÷ horas de la barra Hourly del gráfico (los números que ya se ven).
  const hourlyRow = s?.byType.find((r) => r.kind === 'hourly')
  const activeEmployeesSubtitle =
    hourlyRow && hourlyRow.hours > 0
      ? t('mockKpis.activeEmployeesHourlyRate', { rate: fmtCents(hourlyRow.amount / hourlyRow.hours) })
      : ''
  const spendBeforeData = Boolean(s && headerRange.fechaDesde && headerRange.fechaDesde < s.dataFrom)
  // Unpaid = WO Invoiced + TTK Invoiced + Generic Invoiced − Collected, con los números
  // grandes que se ven: Collected mira exactamente las líneas de esas tres cards (WO: todo
  // el trabajo del rango; TTK y Generic: invoices enteras) con la misma valoración. WO Not
  // Invoiced no es plata facturada: va aparte, como número chico de Unpaid.
  const invoicedShown = b
    ? sumShown(b.woInvoicedValue, b.ttkInvoicedValue, b.genericInvoicedValue)
    : undefined
  // Resumen al lado del título Income: la suma de lo que muestran las cuatro tarjetas.
  const unbilledShown = b ? dollars(b.unbilledValue) : undefined
  const incomeTotalShown =
    invoicedShown !== undefined && unbilledShown !== undefined
      ? invoicedShown + unbilledShown
      : undefined
  // Collected se redondea igual que lo facturado: por tipo y después se suma. Redondeado una
  // sola vez sobre el total, Unpaid daba −$1 con todo cobrado.
  const collectedShown = pc
    ? sumShown(
        pc.incomeCollectedWoValue,
        pc.incomeCollectedTtkValue,
        pc.incomeCollectedGenericValue,
      )
    : undefined
  const unpaidShown =
    invoicedShown !== undefined && collectedShown !== undefined
      ? invoicedShown - collectedShown
      : undefined
  // Plata real (con tax y descuento) de esas mismas líneas: subtítulos de Collected y Unpaid.
  const unpaidRealShown = pc
    ? dollars(pc.incomeInvoicedRealValue) - dollars(pc.incomeCollectedRealValue)
    : undefined
  // The chart shows the months without tax; the debt has tax, so it subtracts the same months as
  // real money, series by series like before.
  const outstandingOutsideChart =
    c && collByMonth.data
      ? dollars(c.outstandingAr) -
        collByMonth.data.reduce(
          (acc, point) =>
            acc +
            shownPending({
              woInvoicedValue: point.woInvoicedRealValue,
              ttkInvoicedValue: point.ttkInvoicedRealValue,
              genericInvoicedValue: point.genericInvoicedRealValue,
              woCollectedValue: point.woCollectedRealValue,
              ttkCollectedValue: point.ttkCollectedRealValue,
              genericCollectedValue: point.genericCollectedRealValue,
            }),
          0,
        )
      : undefined

  return (
    <div className="space-y-6">
      <PageHeading
        title={t('nav.businessKpis')}
        subtitle={
          headerRangeLabel ? (
            <span className="tabular-nums">{headerRangeLabel}</span>
          ) : undefined
        }
        icon={<FileBarChart />}
        variant="info"
        actions={
          <Badge
            variant="outline"
            className="border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-100"
          >
            {t('businessKpis.betaBadge')}
          </Badge>
        }
      />

      <div
        role="note"
        className="flex gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0 opacity-80" aria-hidden />
        <p>{t('businessKpis.betaDisclaimer')}</p>
      </div>

      {!filtersHydrated || selectedDealers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('dealer.selectInHeader')}</p>
      ) : !headerRange.fechaDesde ? (
        <p className="text-sm text-muted-foreground">{t('filters.selectDates')}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <Switch
            id="include-zero"
            checked={includeZero}
            onCheckedChange={setIncludeZero}
            disabled={!rangeReady}
          />
          <Label htmlFor="include-zero" className="cursor-pointer text-sm font-normal">
            {t('businessKpis.includeZero')}
          </Label>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-5">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1.5 rounded-xl border border-border/60 bg-muted/25 p-1.5 shadow-sm sm:grid-cols-4">
          {canSeeProductionTabs ? (
            <>
              <KpiTabTrigger
                value="billing"
                icon={Receipt}
                label={t('mockKpis.tabBilling')}
                accent="sky"
              />
              <KpiTabTrigger
                value="collections"
                icon={Landmark}
                label={t('mockKpis.tabCollections')}
                accent="amber"
              />
              <KpiTabTrigger
                value="punch"
                icon={Fingerprint}
                label={t('mockKpis.tabPunch')}
                accent="violet"
              />
            </>
          ) : null}
          {canSeePayroll ? (
            <KpiTabTrigger
              value="payroll"
              icon={HandCoins}
              label={t('mockKpis.tabPayroll')}
              accent="rose"
            />
          ) : null}
        </TabsList>

        <TabsContent value="production" className="space-y-6">
          <div className="flex items-center gap-3">
            <Switch
              id="filter-date-done"
              checked={filterDateDone}
              onCheckedChange={setFilterDateDone}
              disabled={!rangeReady}
            />
            <Label htmlFor="filter-date-done" className="cursor-pointer text-sm font-normal">
              {t('businessKpis.filterDateDone')}
            </Label>
          </div>
          <KpiErrorBanner q={prod} />
          <div className={KPI_CARD_GRID}>
            <KPICard inline help={t('businessKpisHelp.prodValue')} loading={prod.isLoading} title={t('mockKpis.productionValue')} {...kpiMoneyProps(p?.productionValue)} icon={<Wrench className="h-5 w-5" />} variant="success" />
            <KPICard inline help={t('businessKpisHelp.woCompleted')} loading={prod.isLoading} title={t('mockKpis.wosCompleted')} value={p ? p.woCompleted.toLocaleString() : '—'} icon={<CheckCheck className="h-5 w-5" />} variant="default" />
            <KPICard inline help={t('businessKpisHelp.avgCycle')} loading={prod.isLoading} title={t('mockKpis.avgCycleTime')} value={p ? `${p.avgCycleHours}h` : '—'} icon={<Clock className="h-5 w-5" />} variant="info" subtitle={t('mockKpis.createdToDone')} />
            <KPICard inline help={t('businessKpisHelp.onTime')} loading={prod.isLoading} title={t('mockKpis.onTimeCompletion')} value={p ? `${p.onTimePct}%` : '—'} icon={<Target className="h-5 w-5" />} variant="default" subtitle={t('mockKpis.vsPromiseDate')} />
            <KPICard inline help={t('businessKpisHelp.inspectionFail')} loading={prod.isLoading} title={t('mockKpis.inspectionFailRate')} value={p ? `${p.inspectionFailPct}%` : '—'} icon={<AlertTriangle className="h-5 w-5" />} variant="danger" />
          </div>
          <KpiErrorBanner q={prodWeek} />
          <ProductionWeekChart data={prodWeek.data} loading={prodWeek.isLoading} />

          <div className="space-y-3">
            <KpiErrorBanner q={unbilledByDealer} />
            <UnbilledByDealerTable data={unbilledByDealer.data} loading={unbilledByDealer.isLoading} />
          </div>
        </TabsContent>

        <TabsContent value="billing" className="space-y-6">
          <div className="flex items-center gap-3">
            <Switch
              id="billing-filter-date-done"
              checked={filterDateDone}
              onCheckedChange={setFilterDateDone}
              disabled={!rangeReady}
            />
            <Label
              htmlFor="billing-filter-date-done"
              className="cursor-pointer text-sm font-normal"
            >
              {t('businessKpis.filterDateDone')}
            </Label>
          </div>
          <KpiErrorBanner q={bill} />
          <KpiErrorBanner q={periodColl} />

          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">
              {t('businessKpis.billingPeriodSummary')}
            </p>
            <div className={KPI_CARD_GRID}>
              <KPICard
                inline
                onClick={toggleSummaryDetail}
                expanded={summaryDetailOpen}
                help={t('businessKpisHelp.income')}
                loading={bill.isLoading}
                title={t('businessKpis.incomeTitle')}
                value={incomeTotalShown === undefined ? '—' : fmtDollars(incomeTotalShown)}
                icon={<Landmark className="h-5 w-5" />}
                variant="success"
                subtitle={
                  summaryDetailOpen && invoicedShown !== undefined && unbilledShown !== undefined ? (
                    <>
                      <p>{t('businessKpis.incomeSummaryInvoiced', { amount: fmtDollars(invoicedShown) })}</p>
                      <p>{t('businessKpis.incomeSummaryNotInvoiced', { amount: fmtDollars(unbilledShown) })}</p>
                      <p className="text-muted-foreground">{t('businessKpis.incomeSummaryNoTax')}</p>
                    </>
                  ) : (
                    ''
                  )
                }
              />
              <KPICard
                inline
                onClick={toggleSummaryDetail}
                expanded={summaryDetailOpen}
                help={t('businessKpisHelp.collected')}
                loading={periodColl.isLoading}
                title={t('mockKpis.collected')}
                value={collectedShown === undefined ? '—' : fmtDollars(collectedShown)}
                icon={<DollarSign className="h-5 w-5" />}
                variant="info"
                subtitle={
                  summaryDetailOpen && pc ? (
                    <>
                      <p>{t('mockKpis.withTaxDiscount', { amount: fmtDollars(pc.incomeCollectedRealValue) })}</p>
                      <p>{t('mockKpis.collectionRate') + ': ' + pc.incomeCollectionRatePct + '%'}</p>
                    </>
                  ) : (
                    ''
                  )
                }
              />
              <KPICard
                inline
                onClick={toggleSummaryDetail}
                expanded={summaryDetailOpen}
                help={t('businessKpisHelp.unpaidInPeriod')}
                loading={bill.isLoading || periodColl.isLoading}
                title={t('mockKpis.unpaidInPeriod')}
                value={unpaidShown === undefined ? '—' : fmtDollars(unpaidShown)}
                icon={<Banknote className="h-5 w-5" />}
                variant="danger"
                subtitle={
                  summaryDetailOpen && pc && unpaidRealShown !== undefined ? (
                    <>
                      <p>
                        {t('mockKpis.withTaxDiscount', { amount: fmtDollars(unpaidRealShown) })}
                        {' · '}
                        {t('mockKpis.unpaidInPeriodStatements', {
                          count: pc.unpaidInPeriodStatements,
                        })}
                      </p>
                      {b ? (
                        <p>{t('mockKpis.unpaidNotInvoiced', { amount: fmtDollars(b.unbilledValue) })}</p>
                      ) : null}
                    </>
                  ) : (
                    ''
                  )
                }
              />
            </div>
          </div>

          <div className={KPI_CARD_GRID}>
            <KPICard inline help={t('businessKpisHelp.statements')} loading={bill.isLoading} title={t('mockKpis.statementsIssued')} value={b ? b.statementsIssued.toLocaleString() : '—'} icon={<Receipt className="h-5 w-5" />} variant="default" subtitle={b ? t('mockKpis.avgPerStatement', { amount: fmtMoney(b.avgInvoiceValue) }) : ''} />
            <KPICard inline help={t('businessKpisHelp.doneToInvoiced')} loading={bill.isLoading} title={t('mockKpis.woDoneToInvoiced')} value={b ? `${b.avgDoneToInvoicedDays}d` : '—'} icon={<CalendarClock className="h-5 w-5" />} variant="warning" />
            <KPICard inline help={t('businessKpisHelp.sent')} loading={bill.isLoading} title={t('mockKpis.statementsSent')} value={b ? `${b.sentPct}%` : '—'} icon={<Send className="h-5 w-5" />} variant="info" subtitle={b ? t('mockKpis.neverSent', { count: b.unsentStatements }) : ''} />
            <KPICard inline help={t('businessKpisHelp.partialOverlapWo')} loading={bill.isLoading} title={t('mockKpis.partialOverlapWoStatements')} value={b ? b.partialOverlapWoStatements.toLocaleString() : '—'} icon={<CalendarRange className="h-5 w-5" />} variant="default" />
          </div>

          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border pb-2">
              <h2 className="text-lg font-semibold sm:text-xl tracking-tight text-foreground">
                {t('businessKpis.incomeTitle')}
              </h2>
            </div>
            <div className={KPI_CARD_GRID}>
            <KPICard
              inline
              help={t('businessKpisHelp.unbilled')}
              loading={bill.isLoading}
              title={t('mockKpis.doneNotInvoiced')}
              value={b ? fmtDollars(b.unbilledValue) : '—'}
              icon={<Hourglass className="h-5 w-5" />}
              variant="danger"
            />
            <KPICard inline help={t('businessKpisHelp.ttkInvoiced')} loading={bill.isLoading} title={t('mockKpis.ttkInvoiced')} value={b ? fmtDollars(b.ttkInvoicedValue) : '—'} icon={<Fingerprint className="h-5 w-5" />} variant="info" subtitle={billingSplitSubtitle(b, b?.ttkInvoicedValue, b?.ttkInvoicedInRangeValue, t)} />
            <KPICard inline help={t('businessKpisHelp.woInvoiced')} loading={bill.isLoading} title={t('mockKpis.woInvoiced')} value={b ? fmtDollars(b.woInvoicedValue) : '—'} icon={<Wrench className="h-5 w-5" />} variant="success" subtitle={billingSplitSubtitle(b, b?.woInvoicedValue, b?.woInvoicedInRangeValue, t)} />
            <KPICard inline help={t('businessKpisHelp.genericInvoiced')} loading={bill.isLoading} title={t('mockKpis.genericInvoiced')} value={b ? fmtDollars(b.genericInvoicedValue) : '—'} icon={<FileBarChart className="h-5 w-5" />} variant="violet" subtitle={billingSplitSubtitle(b, b?.genericInvoicedValue, b?.genericInvoicedInRangeValue, t)} />
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-3 lg:col-span-2">
              <KpiErrorBanner q={billWeek} />
              <BillingWeekChart data={billWeek.data} loading={billWeek.isLoading} />
            </div>
            <div className="space-y-3">
              <KpiErrorBanner q={unbilledAging} />
              <UnbilledAgingChart data={unbilledAging.data} loading={unbilledAging.isLoading} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="collections" className="space-y-6">
          <KpiErrorBanner q={coll} />
          <p className="text-sm text-muted-foreground">{t('businessKpis.collectionsSnapshotNote')}</p>
          <div className={KPI_CARD_GRID}>
            <KPICard
              inline
              help={t('businessKpisHelp.outstandingAr')}
              loading={coll.isLoading}
              title={t('mockKpis.outstandingAr')}
              value={c ? fmtDollars(c.outstandingAr) : '—'}
              icon={<Banknote className="h-5 w-5" />}
              variant="warning"
              subtitle={
                c ? (
                  <>
                    <p>
                      {outstandingOutsideChart === undefined
                        ? t('mockKpis.outstandingArSubtitle', { count: c.openStatements })
                        : t('mockKpis.outstandingArOutsideChart', {
                            count: c.openStatements,
                            amount: fmtDollars(outstandingOutsideChart),
                          })}
                    </p>
                    <p>{t('mockKpis.outstandingArNoTax', { amount: fmtDollars(c.outstandingArNoTax) })}</p>
                  </>
                ) : (
                  ''
                )
              }
            />
            <KPICard inline help={t('businessKpisHelp.dso')} loading={coll.isLoading} title={t('mockKpis.dsoDaysToCollect')} value={c ? `${c.dsoDays}d` : '—'} icon={<CalendarClock className="h-5 w-5" />} variant="danger" />
            <KPICard inline help={t('businessKpisHelp.arOver60')} loading={coll.isLoading} title={t('mockKpis.arOver60')} value={c ? `${c.arOver60Pct}%` : '—'} icon={<AlertTriangle className="h-5 w-5" />} variant="violet" />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Label htmlFor="collections-history-months" className="text-sm font-normal text-muted-foreground">
              {t('businessKpis.collectionsHistoryMonths')}
            </Label>
            <Select
              value={String(collectionsHistoryMonths)}
              onValueChange={(value) => setCollectionsHistoryMonths(Number(value) as CollectionsHistoryMonths)}
              disabled={!rangeReady}
            >
              <SelectTrigger id="collections-history-months" className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLLECTIONS_HISTORY_MONTHS.map((months) => (
                  <SelectItem key={months} value={String(months)}>
                    {t('businessKpis.collectionsHistoryMonthsOption', { count: months })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <KpiErrorBanner q={collByMonth} />
          <InvoiceCollectionMonthChart data={collByMonth.data} loading={collByMonth.isLoading} />
        </TabsContent>

        <TabsContent value="punch" className="space-y-6">
          <KpiErrorBanner q={punch} />
          <div className={KPI_CARD_GRID}>
            <KPICard inline help={t('businessKpisHelp.punchError')} loading={punch.isLoading} title={t('mockKpis.punchErrorRate')} value={k ? `${k.errorRatePct}%` : '—'} icon={<Fingerprint className="h-5 w-5" />} variant="danger" subtitle={k ? `${k.totalPunches.toLocaleString()} punches` : ''} />
            <KPICard inline help={t('businessKpisHelp.missingOut')} loading={punch.isLoading} title={t('mockKpis.missingPunchOut')} value={k ? k.missingPunchOut : '—'} icon={<AlertTriangle className="h-5 w-5" />} variant="warning" subtitle={k ? t('mockKpis.missingBreakEndSuffix', { count: k.missingBreakEnd }) : ''} />
            <KPICard inline help={t('businessKpisHelp.manual')} loading={punch.isLoading} title={t('mockKpis.manualPunches')} value={k ? k.manualPunches : '—'} icon={<Pencil className="h-5 w-5" />} variant="violet" />
            <KPICard inline help={t('businessKpisHelp.adminCorrections')} loading={punch.isLoading} title={t('mockKpis.adminCorrections')} value={k ? k.adminCorrections : '—'} icon={<ClipboardCheck className="h-5 w-5" />} variant="info" />
            <KPICard inline help={t('businessKpisHelp.correctionDelay')} loading={punch.isLoading} title={t('mockKpis.correctionDelay')} value={k ? `${k.avgCorrectionDelayDays}d` : '—'} icon={<Clock className="h-5 w-5" />} variant="default" />
            <KPICard inline help={t('businessKpisHelp.deleted')} loading={punch.isLoading} title={t('mockKpis.deletedPunches')} value={k ? k.deletedPunches : '—'} icon={<Trash2 className="h-5 w-5" />} variant="danger" />
          </div>
        </TabsContent>

        <TabsContent value="payroll" className="space-y-6">
          {s && s.paymentMethod === null ? (
            <p className="text-sm text-muted-foreground">{t('businessKpis.payrollNoPeriod')}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                  <RefreshCw className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="tabular-nums">
                    {spend.isLoading
                      ? '…'
                      : spendStamp
                        ? t('businessKpis.payrollLastUpdated', spendStamp)
                        : t('businessKpis.payrollNotCalculated')}
                  </span>
                </p>
                {spendBeforeData && s ? (
                  <p className="flex min-w-0 items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400">
                    <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
                    <span>{t('businessKpis.payrollNoDataBefore', { date: formatUsCalendarDate(s.dataFrom) })}</span>
                  </p>
                ) : null}
              </div>
              <KpiErrorBanner q={spend} />
              <div className={KPI_CARD_GRID}>
                <KPICard
                  inline
                  help={t('businessKpisHelp.totalPayroll')}
                  loading={spend.isLoading}
                  title={t('mockKpis.totalPayroll')}
                  {...kpiCentsProps(s?.totalPayroll)}
                  icon={<HandCoins className="h-5 w-5" />}
                  variant="success"
                  // Con todos los dealers el total incluye los salarios sin dealer: se dice cuánto y de cuántos.
                  subtitle={
                    s?.allDealers && s.withoutDealer && s.withoutDealer.amount !== 0
                      ? t(
                          s.withoutDealer.employees === 1
                            ? 'mockKpis.totalPayrollWithoutDealerOne'
                            : 'mockKpis.totalPayrollWithoutDealer',
                          { amount: fmtCents(s.withoutDealer.amount), employees: s.withoutDealer.employees },
                        )
                      : ''
                  }
                />
                <KPICard
                  inline
                  help={t('businessKpisHelp.overtime')}
                  loading={spend.isLoading}
                  title={t('mockKpis.overtimePayment')}
                  {...kpiCentsProps(s?.overtime.amount)}
                  icon={<Timer className="h-5 w-5" />}
                  variant="warning"
                />
                <KPICard
                  inline
                  help={t('businessKpisHelp.overtimeHours')}
                  loading={spend.isLoading}
                  title={t('mockKpis.overtimeHours')}
                  value={s ? `${s.overtime.hours.toLocaleString('en-US', { maximumFractionDigits: 2 })} h` : '—'}
                  icon={<Clock className="h-5 w-5" />}
                  variant="warning"
                  subtitle={
                    s
                      ? s.overtime.employeesOver40 === 1
                        ? t('mockKpis.hoursOver40One')
                        : t('mockKpis.hoursOver40', { employees: s.overtime.employeesOver40 })
                      : ''
                  }
                />
                <KPICard
                  inline
                  help={t('businessKpisHelp.piecework')}
                  loading={spend.isLoading}
                  title={t('mockKpis.piecework')}
                  {...kpiCentsProps(s?.piecework)}
                  icon={<Package className="h-5 w-5" />}
                  variant="info"
                />
              </div>
            </>
          )}
          <KpiErrorBanner q={pay} />
          <div className={KPI_CARD_GRID}>
            {/* Total Payroll (primera tarjeta) ÷ Income (tab Billing), con los mismos números que se ven. */}
            <KPICard inline help={t('businessKpisHelp.laborCost')} loading={spend.isLoading || bill.isLoading} title={t('mockKpis.laborCostRevenue')} value={s && incomeTotalShown ? `${Math.round((s.totalPayroll / incomeTotalShown) * 1000) / 10}%` : '—'} icon={<Percent className="h-5 w-5" />} variant="violet" />
            {/* Total Payroll (con piecework) ÷ WOs Completed de la tab Production. */}
            <KPICard inline help={t('businessKpisHelp.costPerWo')} loading={spend.isLoading || prod.isLoading} title={t('mockKpis.costPerWo')} value={s && p && p.woCompleted > 0 ? fmtCents(s.totalPayroll / p.woCompleted) : '—'} icon={<Wrench className="h-5 w-5" />} variant="info" />
            <KPICard inline help={t('businessKpisHelp.activeEmployees')} loading={pay.isLoading} title={t('mockCosts.activeEmployees')} value={y ? y.activeEmployees : '—'} icon={<Users className="h-5 w-5" />} variant="default" subtitle={activeEmployeesSubtitle} />
            {/* Income (tab Billing) ÷ Active Employees (la tarjeta de al lado). */}
            <KPICard inline help={t('businessKpisHelp.revenuePerEmployee')} loading={pay.isLoading || bill.isLoading} title={t('mockKpis.revenuePerEmployee')} {...kpiCentsProps(y && y.activeEmployees > 0 && incomeTotalShown !== undefined ? incomeTotalShown / y.activeEmployees : undefined)} icon={<TrendingUp className="h-5 w-5" />} variant="success" />
          </div>
          {s && s.paymentMethod !== null ? (
            <>
              <PayrollByTypeChart
                data={s}
                loading={spend.isLoading}
                rangeLabel={headerRangeLabel}
                dealerCount={selectedDealers.length}
              />
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>{t('businessKpis.payrollNote1')}</p>
                <p>{t('businessKpis.payrollNote2')}</p>
                <p>{t('businessKpis.payrollNote3')}</p>
                <p>{t('businessKpis.payrollNote4')}</p>
                <p>{t('businessKpis.payrollNote5')}</p>
                <p>{t('businessKpis.payrollNote6')}</p>
                {s.withoutDealer && !s.allDealers && s.withoutDealer.amount !== 0 ? (
                  <p>{t('businessKpis.payrollWithoutDealer', { amount: fmtDollars(s.withoutDealer.amount) })}</p>
                ) : null}
                {s.dealerRestricted ? <p>{t('businessKpis.payrollDealerRestricted')}</p> : null}
              </div>
            </>
          ) : spend.isLoading ? (
            <PayrollByTypeChart loading rangeLabel={headerRangeLabel} dealerCount={selectedDealers.length} />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function KpiErrorBanner({ q }: { q: { isLoading: boolean; isError: boolean; error: unknown } }) {
  const { t } = useTranslation()
  if (q.isLoading || !q.isError) return null
  const msg = isSrsBusyError(q.error)
    ? t('common.serverBusy')
    : q.error instanceof Error
      ? q.error.message
      : t('common.failedToLoad')
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {msg}
    </div>
  )
}

type KpiTabAccent = 'emerald' | 'sky' | 'amber' | 'violet' | 'rose'

const kpiTabAccentStyles: Record<
  KpiTabAccent,
  { icon: string; ring: string; label: string }
> = {
  emerald: {
    icon: 'group-data-[state=active]:bg-emerald-500 group-data-[state=active]:text-white group-data-[state=active]:shadow-emerald-500/35',
    ring: 'group-data-[state=active]:ring-emerald-500/25',
    label: 'group-data-[state=active]:text-emerald-950 dark:group-data-[state=active]:text-emerald-50',
  },
  sky: {
    icon: 'group-data-[state=active]:bg-accent group-data-[state=active]:text-white group-data-[state=active]:shadow-accent/35',
    ring: 'group-data-[state=active]:ring-accent/25',
    label: 'group-data-[state=active]:text-accent dark:group-data-[state=active]:text-accent',
  },
  amber: {
    icon: 'group-data-[state=active]:bg-amber-500 group-data-[state=active]:text-white group-data-[state=active]:shadow-amber-500/35',
    ring: 'group-data-[state=active]:ring-amber-500/25',
    label: 'group-data-[state=active]:text-amber-950 dark:group-data-[state=active]:text-amber-50',
  },
  violet: {
    icon: 'group-data-[state=active]:bg-violet-500 group-data-[state=active]:text-white group-data-[state=active]:shadow-violet-500/35',
    ring: 'group-data-[state=active]:ring-violet-500/25',
    label: 'group-data-[state=active]:text-violet-950 dark:group-data-[state=active]:text-violet-50',
  },
  rose: {
    icon: 'group-data-[state=active]:bg-rose-500 group-data-[state=active]:text-white group-data-[state=active]:shadow-rose-500/35',
    ring: 'group-data-[state=active]:ring-rose-500/25',
    label: 'group-data-[state=active]:text-rose-950 dark:group-data-[state=active]:text-rose-50',
  },
}

function KpiTabTrigger({
  value,
  icon: Icon,
  label,
  accent,
}: {
  value: string
  icon: LucideIcon
  label: string
  accent: KpiTabAccent
}) {
  const styles = kpiTabAccentStyles[accent]

  return (
    <TabsTrigger
      value={value}
      className={cn(
        'group h-auto min-h-[3.25rem] w-full flex-none flex-col items-center justify-center gap-1.5 rounded-lg border border-transparent px-2 py-2.5 sm:flex-row sm:justify-start sm:gap-2.5 sm:px-3',
        'text-muted-foreground transition-all duration-200',
        'hover:bg-background/70 hover:text-foreground',
        'data-[state=active]:border-border/70 data-[state=active]:bg-background data-[state=active]:shadow-md',
        styles.ring,
        styles.label,
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background/90 text-muted-foreground ring-1 ring-border/50 shadow-sm transition-all duration-200',
          'group-data-[state=active]:scale-105 group-data-[state=active]:shadow-md',
          styles.icon,
        )}
      >
        <Icon className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
      </span>
      <span className="max-w-full truncate text-center text-xs font-semibold leading-tight sm:text-left sm:text-sm">
        {label}
      </span>
    </TabsTrigger>
  )
}
