'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CheckCheck,
  ClipboardCheck,
  Clock,
  DollarSign,
  Factory,
  Fingerprint,
  HandCoins,
  Hourglass,
  Landmark,
  Pencil,
  Percent,
  Receipt,
  Send,
  Target,
  Timer,
  Trash2,
  TrendingUp,
  Users,
  Wrench,
  FileBarChart,
  type LucideIcon,
} from 'lucide-react'
import { KPICard } from '@/components/dashboard/kpi-card'
import { ProductionWeekChart } from '@/components/dashboard/production-week-chart'
import { ProductionDealerTable } from '@/components/dashboard/production-dealer-table'
import { PageHeading } from '@/components/layout/page-heading'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useFilters } from '@/lib/filter-context'
import { formatDateParam } from '@/lib/ttk/map-header-filters'
import { useTranslation } from '@/lib/i18n/locale-context'
import { PAYROLL_WEEKS } from '@/lib/payroll-report-mock-data'
import { cn } from '@/lib/utils'
import {
  fetchBillingKpi,
  fetchCollectionsKpi,
  fetchPayrollKpi,
  fetchProductionKpi,
  fetchProductionByWeek,
  fetchProductionByDealer,
  fetchPunchKpi,
  type KpiQueryParams,
} from '@/lib/srs-kpis-api'

const fmtMoney = (n: number | undefined) =>
  n === undefined ? '—' : `$${Math.round(n).toLocaleString()}`
const fmtMoneyK = (n: number | undefined) =>
  n === undefined ? '—' : n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`

/** Abreviado en tarjeta ($40.2k); click muestra monto completo ($40,162). */
function kpiMoneyProps(n: number | undefined): { value: string; valueFull?: string } {
  if (n === undefined) return { value: '—' }
  const full = fmtMoney(n)
  if (n >= 1000) return { value: fmtMoneyK(n), valueFull: full }
  return { value: full }
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

export default function BusinessKpisPage() {
  const { t } = useTranslation()
  const { dateRange, selectedDealers, filtersHydrated } = useFilters()
  const [payrollWeek, setPayrollWeek] = useState(PAYROLL_WEEKS[PAYROLL_WEEKS.length - 1].value)
  const [filterDateDone, setFilterDateDone] = useState(true)

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

  const payrollWeekMeta = useMemo(
    () => PAYROLL_WEEKS.find((w) => w.value === payrollWeek) ?? PAYROLL_WEEKS[PAYROLL_WEEKS.length - 1],
    [payrollWeek],
  )

  const rangeReady =
    filtersHydrated && selectedDealers.length > 0 && Boolean(headerRange.fechaDesde)

  const headerKpiParams = useMemo((): KpiQueryParams | null => {
    if (!rangeReady) return null
    return {
      fechaDesde: headerRange.fechaDesde,
      fechaHasta: headerRange.fechaHasta,
      idDealer,
    }
  }, [rangeReady, headerRange, idDealer])

  const productionKpiParams = useMemo((): KpiQueryParams | null => {
    if (!headerKpiParams) return null
    return { ...headerKpiParams, filterDateDone }
  }, [headerKpiParams, filterDateDone])

  const payrollKpiParams = useMemo((): KpiQueryParams | null => {
    if (!rangeReady) return null
    return {
      fechaDesde: payrollWeekMeta.start,
      fechaHasta: payrollWeekMeta.end,
      idDealer,
    }
  }, [rangeReady, payrollWeekMeta, idDealer])

  const prod = useQuery({
    queryKey: ['srs-kpi', 'production', productionKpiParams],
    queryFn: () => fetchProductionKpi(productionKpiParams!),
    enabled: Boolean(productionKpiParams),
  })
  const prodWeek = useQuery({
    queryKey: ['srs-kpi', 'production-by-week', productionKpiParams],
    queryFn: () => fetchProductionByWeek(productionKpiParams!),
    enabled: Boolean(productionKpiParams),
  })
  const prodDealer = useQuery({
    queryKey: ['srs-kpi', 'production-by-dealer', productionKpiParams],
    queryFn: () => fetchProductionByDealer(productionKpiParams!),
    enabled: Boolean(productionKpiParams),
  })
  const bill = useQuery({
    queryKey: ['srs-kpi', 'billing', headerKpiParams],
    queryFn: () => fetchBillingKpi(headerKpiParams!),
    enabled: Boolean(headerKpiParams),
  })
  const coll = useQuery({
    queryKey: ['srs-kpi', 'collections', headerKpiParams],
    queryFn: () => fetchCollectionsKpi(headerKpiParams!),
    enabled: Boolean(headerKpiParams),
  })
  const punch = useQuery({
    queryKey: ['srs-kpi', 'punch', headerKpiParams],
    queryFn: () => fetchPunchKpi(headerKpiParams!),
    enabled: Boolean(headerKpiParams),
  })
  const pay = useQuery({
    queryKey: ['srs-kpi', 'payroll', payrollKpiParams],
    queryFn: () => fetchPayrollKpi(payrollKpiParams!),
    enabled: Boolean(payrollKpiParams),
  })

  const p = prod.data
  const b = bill.data
  const c = coll.data
  const k = punch.data
  const y = pay.data

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
      />

      {!filtersHydrated || selectedDealers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('dealer.selectInHeader')}</p>
      ) : !headerRange.fechaDesde ? (
        <p className="text-sm text-muted-foreground">{t('filters.selectDates')}</p>
      ) : null}

      <Tabs defaultValue="production" className="gap-5">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1.5 rounded-xl border border-border/60 bg-muted/25 p-1.5 shadow-sm sm:grid-cols-3 lg:grid-cols-5">
          <KpiTabTrigger
            value="production"
            icon={Factory}
            label={t('mockKpis.tabProduction')}
            accent="emerald"
          />
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
          <KpiTabTrigger
            value="payroll"
            icon={HandCoins}
            label={t('mockKpis.tabPayroll')}
            accent="rose"
          />
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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KPICard compact help={t('businessKpisHelp.prodValue')} loading={prod.isLoading} title={t('mockKpis.productionValue')} {...kpiMoneyProps(p?.productionValue)} icon={<Wrench className="h-5 w-5" />} variant="success" />
            <KPICard compact help={t('businessKpisHelp.woCompleted')} loading={prod.isLoading} title={t('mockKpis.wosCompleted')} value={p ? p.woCompleted.toLocaleString() : '—'} icon={<CheckCheck className="h-5 w-5" />} variant="default" />
            <KPICard compact help={t('businessKpisHelp.avgCycle')} loading={prod.isLoading} title={t('mockKpis.avgCycleTime')} value={p ? `${p.avgCycleHours}h` : '—'} icon={<Clock className="h-5 w-5" />} variant="info" subtitle={t('mockKpis.createdToDone')} />
            <KPICard compact help={t('businessKpisHelp.onTime')} loading={prod.isLoading} title={t('mockKpis.onTimeCompletion')} value={p ? `${p.onTimePct}%` : '—'} icon={<Target className="h-5 w-5" />} variant="default" subtitle={t('mockKpis.vsPromiseDate')} />
            <KPICard compact help={t('businessKpisHelp.inspectionFail')} loading={prod.isLoading} title={t('mockKpis.inspectionFailRate')} value={p ? `${p.inspectionFailPct}%` : '—'} icon={<AlertTriangle className="h-5 w-5" />} variant="danger" />
          </div>
          <KpiErrorBanner q={prodWeek} />
          <ProductionWeekChart data={prodWeek.data} loading={prodWeek.isLoading} />
          <KpiErrorBanner q={prodDealer} />
          <ProductionDealerTable data={prodDealer.data} loading={prodDealer.isLoading} />
        </TabsContent>

        <TabsContent value="billing" className="space-y-6">
          <KpiErrorBanner q={bill} />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KPICard compact help={t('businessKpisHelp.invoiced')} loading={bill.isLoading} title={t('mockKpis.invoiced')} {...kpiMoneyProps(b?.invoicedValue)} icon={<Receipt className="h-5 w-5" />} variant="success" />
            <KPICard compact help={t('businessKpisHelp.statements')} loading={bill.isLoading} title={t('mockKpis.statementsIssued')} value={b ? b.statementsIssued.toLocaleString() : '—'} icon={<Receipt className="h-5 w-5" />} variant="default" subtitle={b ? t('mockKpis.avgPerStatement', { amount: fmtMoney(b.avgInvoiceValue) }) : ''} />
            <KPICard compact help={t('businessKpisHelp.unbilled')} loading={bill.isLoading} title={t('mockKpis.doneNotInvoiced')} value={b ? b.unbilledWos : '—'} icon={<Hourglass className="h-5 w-5" />} variant="danger" subtitle={b ? fmtMoney(b.unbilledValue) : ''} />
            <KPICard compact help={t('businessKpisHelp.doneToInvoiced')} loading={bill.isLoading} title={t('mockKpis.woDoneToInvoiced')} value={b ? `${b.avgDoneToInvoicedDays}d` : '—'} icon={<CalendarClock className="h-5 w-5" />} variant="warning" />
            <KPICard compact help={t('businessKpisHelp.sent')} loading={bill.isLoading} title={t('mockKpis.statementsSent')} value={b ? `${b.sentPct}%` : '—'} icon={<Send className="h-5 w-5" />} variant="info" subtitle={b ? t('mockKpis.neverSent', { count: b.unsentStatements }) : ''} />
          </div>
        </TabsContent>

        <TabsContent value="collections" className="space-y-6">
          <KpiErrorBanner q={coll} />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KPICard compact help={t('businessKpisHelp.outstandingAr')} loading={coll.isLoading} title={t('mockKpis.outstandingAr')} {...kpiMoneyProps(c?.outstandingAr)} icon={<Banknote className="h-5 w-5" />} variant="warning" subtitle={c ? t('mockKpis.openStatements', { count: c.openStatements }) : ''} />
            <KPICard compact help={t('businessKpisHelp.dso')} loading={coll.isLoading} title={t('mockKpis.dsoDaysToCollect')} value={c ? `${c.dsoDays}d` : '—'} icon={<CalendarClock className="h-5 w-5" />} variant="danger" />
            <KPICard compact help={t('businessKpisHelp.collected')} loading={coll.isLoading} title={t('mockKpis.collected')} {...kpiMoneyProps(c?.collectedValue)} icon={<DollarSign className="h-5 w-5" />} variant="success" />
            <KPICard compact help={t('businessKpisHelp.collectionRate')} loading={coll.isLoading} title={t('mockKpis.collectionRate')} value={c ? `${c.collectionRatePct}%` : '—'} icon={<Percent className="h-5 w-5" />} variant="info" />
            <KPICard compact help={t('businessKpisHelp.arOver60')} loading={coll.isLoading} title={t('mockKpis.arOver60')} value={c ? `${c.arOver60Pct}%` : '—'} icon={<AlertTriangle className="h-5 w-5" />} variant="violet" />
          </div>
        </TabsContent>

        <TabsContent value="punch" className="space-y-6">
          <KpiErrorBanner q={punch} />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KPICard compact help={t('businessKpisHelp.punchError')} loading={punch.isLoading} title={t('mockKpis.punchErrorRate')} value={k ? `${k.errorRatePct}%` : '—'} icon={<Fingerprint className="h-5 w-5" />} variant="danger" subtitle={k ? `${k.totalPunches.toLocaleString()} punches` : ''} />
            <KPICard compact help={t('businessKpisHelp.missingOut')} loading={punch.isLoading} title={t('mockKpis.missingPunchOut')} value={k ? k.missingPunchOut : '—'} icon={<AlertTriangle className="h-5 w-5" />} variant="warning" subtitle={k ? t('mockKpis.missingBreakEndSuffix', { count: k.missingBreakEnd }) : ''} />
            <KPICard compact help={t('businessKpisHelp.manual')} loading={punch.isLoading} title={t('mockKpis.manualPunches')} value={k ? k.manualPunches : '—'} icon={<Pencil className="h-5 w-5" />} variant="violet" />
            <KPICard compact help={t('businessKpisHelp.adminCorrections')} loading={punch.isLoading} title={t('mockKpis.adminCorrections')} value={k ? k.adminCorrections : '—'} icon={<ClipboardCheck className="h-5 w-5" />} variant="info" />
            <KPICard compact help={t('businessKpisHelp.correctionDelay')} loading={punch.isLoading} title={t('mockKpis.correctionDelay')} value={k ? `${k.avgCorrectionDelayDays}d` : '—'} icon={<Clock className="h-5 w-5" />} variant="default" />
            <KPICard compact help={t('businessKpisHelp.deleted')} loading={punch.isLoading} title={t('mockKpis.deletedPunches')} value={k ? k.deletedPunches : '—'} icon={<Trash2 className="h-5 w-5" />} variant="danger" />
          </div>
        </TabsContent>

        <TabsContent value="payroll" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground tabular-nums">
              {formatUsDateRange(new Date(`${payrollWeekMeta.start}T12:00:00`), new Date(`${payrollWeekMeta.end}T12:00:00`))}
            </p>
            <Select value={payrollWeek} onValueChange={setPayrollWeek}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYROLL_WEEKS.map((w) => (
                  <SelectItem key={w.value} value={w.value}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <KpiErrorBanner q={pay} />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KPICard compact help={t('businessKpisHelp.totalPayroll')} loading={pay.isLoading} title={t('mockKpis.totalPayroll')} {...kpiMoneyProps(y?.totalPayroll)} icon={<HandCoins className="h-5 w-5" />} variant="success" />
            <KPICard compact help={t('businessKpisHelp.overtime')} loading={pay.isLoading} title={t('mockKpis.overtimeCost')} {...kpiMoneyProps(y?.overtimeCost)} icon={<Timer className="h-5 w-5" />} variant="warning" subtitle={y ? t('mockKpis.pctOfPayroll', { pct: y.overtimePct }) : ''} />
            <KPICard compact help={t('businessKpisHelp.laborCost')} loading={pay.isLoading} title={t('mockKpis.laborCostRevenue')} value={y ? `${y.laborCostPct}%` : '—'} icon={<Percent className="h-5 w-5" />} variant="violet" />
            <KPICard compact help={t('businessKpisHelp.costPerWo')} loading={pay.isLoading} title={t('mockKpis.costPerWo')} value={y ? `$${y.avgCostPerWo.toFixed(2)}` : '—'} icon={<Wrench className="h-5 w-5" />} variant="info" />
            <KPICard compact help={t('businessKpisHelp.activeEmployees')} loading={pay.isLoading} title={t('mockCosts.activeEmployees')} value={y ? y.activeEmployees : '—'} icon={<Users className="h-5 w-5" />} variant="default" subtitle={y ? t('mockKpis.avgRatePerHour', { rate: y.avgHourlyRate }) : ''} />
            <KPICard compact help={t('businessKpisHelp.revenuePerEmployee')} loading={pay.isLoading} title={t('mockKpis.revenuePerEmployee')} {...kpiMoneyProps(y && p ? Math.round(p.productionValue / Math.max(1, y.activeEmployees)) : undefined)} icon={<TrendingUp className="h-5 w-5" />} variant="success" />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function KpiErrorBanner({ q }: { q: { isLoading: boolean; isError: boolean; error: unknown } }) {
  const { t } = useTranslation()
  if (q.isLoading || !q.isError) return null
  const msg = q.error instanceof Error ? q.error.message : t('common.failedToLoad')
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
    icon: 'group-data-[state=active]:bg-sky-500 group-data-[state=active]:text-white group-data-[state=active]:shadow-sky-500/35',
    ring: 'group-data-[state=active]:ring-sky-500/25',
    label: 'group-data-[state=active]:text-sky-950 dark:group-data-[state=active]:text-sky-50',
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
