'use client'

// =============================================================================
// Business KPIs — DEV ONLY page (hidden in production via PROD_NAV_HREFS +
// ProdRouteGuard). Mock data modeled on the real SRS schema, see
// lib/kpi-mock-data.ts for the table-by-table mapping.
// =============================================================================

import { useState } from 'react'
import {
  AlertTriangle,
  Banknote,
  Building2,
  CalendarClock,
  CheckCheck,
  ClipboardCheck,
  Clock,
  DollarSign,
  FileText,
  Fingerprint,
  Gauge,
  HandCoins,
  Hourglass,
  Layers,
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
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { KPICard } from '@/components/dashboard/kpi-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ExportButton } from '@/components/shared/export-button'
import { useTranslation } from '@/lib/i18n/locale-context'
import { cn } from '@/lib/utils'
import {
  PUNCH_OFFENDERS,
  UNBILLED_BY_DEALER,
  WORST_PAYERS,
  getArAging,
  getBillingKpis,
  getCollectionsKpis,
  getDealerProduction,
  getExecutiveSummary,
  getKpiPeriodOptions,
  getKpiSeries,
  getPayrollByDealer,
  getPayrollByType,
  getPayrollKpis,
  getProductionKpis,
  getPunchErrorBreakdown,
  getPunchQualityKpis,
  getUnbilledAging,
  getWoStatusPipeline,
  type KpiPeriod,
} from '@/lib/kpi-mock-data'

const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString()}`
const fmtMoneyK = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`)

function AttainmentBadge({ pct }: { pct: number }) {
  const cls =
    pct >= 100
      ? 'bg-success/10 text-success'
      : pct >= 90
        ? 'bg-warning/15 text-amber-600'
        : 'bg-destructive/10 text-destructive'
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', cls)}>
      {pct.toFixed(1)}%
    </span>
  )
}

export default function KpisPage() {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<KpiPeriod>('4w')

  const periodOptions = getKpiPeriodOptions(t)
  const woStatusPipeline = getWoStatusPipeline(t)
  const unbilledAging = getUnbilledAging(t)
  const arAging = getArAging(t)

  const series = getKpiSeries(period)
  const exec = getExecutiveSummary(period)
  const prod = getProductionKpis(period)
  const billing = getBillingKpis(period)
  const collections = getCollectionsKpis(period)
  const punch = getPunchQualityKpis(period)
  const payroll = getPayrollKpis(period)

  const dealerProduction = getDealerProduction(period)
  const punchErrorBreakdown = getPunchErrorBreakdown(period, t)
  const payrollByType = getPayrollByType(period, t)
  const payrollByDealer = getPayrollByDealer(period)

  const errorRateSeries = series.map((w) => ({
    week: w.week,
    errorRate: Math.round((w.punchErrors / w.punches) * 1000) / 10,
  }))

  const laborSeries = series.map((w) => ({
    week: w.week,
    payroll: w.payrollCost,
    production: w.productionValue,
    laborPct: Math.round((w.payrollCost / w.productionValue) * 1000) / 10,
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <Gauge className="h-7 w-7 text-primary" />
            {t('mockKpis.title')}
            <Badge variant="outline" className="border-violet-300 bg-violet-50 text-violet-700">
              {t('common.dev')}
            </Badge>
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('mockKpis.subtitle')}
          </p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as KpiPeriod)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {periodOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Executive summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <KPICard
          compact
          title={t('mockKpis.productionValue')}
          value={fmtMoneyK(exec.productionValue)}
          icon={<Wrench className="h-5 w-5" />}
          variant="success"
          trend={{ value: exec.productionTrend, label: t('mockKpis.vsPrev') }}
        />
        <KPICard
          compact
          title={t('mockKpis.wosCompleted')}
          value={exec.woCompleted.toLocaleString()}
          icon={<CheckCheck className="h-5 w-5" />}
          variant="default"
          trend={{ value: exec.woTrend, label: t('mockKpis.vsPrev') }}
        />
        <KPICard
          compact
          title={t('mockKpis.invoiced')}
          value={fmtMoneyK(exec.invoicedValue)}
          icon={<Receipt className="h-5 w-5" />}
          variant="info"
          trend={{ value: exec.invoicedTrend, label: t('mockKpis.vsPrev') }}
        />
        <KPICard
          compact
          title={t('mockKpis.dsoDaysToCollect')}
          value={`${exec.dsoDays}d`}
          icon={<CalendarClock className="h-5 w-5" />}
          variant="warning"
          subtitle={t('mockKpis.daysVsPrevLowerBetter', { value: exec.dsoTrend })}
        />
        <KPICard
          compact
          title={t('mockKpis.punchErrorRate')}
          value={`${exec.punchErrorRate}%`}
          icon={<Fingerprint className="h-5 w-5" />}
          variant="danger"
          subtitle={t('mockKpis.ppVsPrev', { value: exec.punchErrorTrend })}
        />
        <KPICard
          compact
          title={t('mockKpis.laborCostRevenue')}
          value={`${exec.laborCostPct}%`}
          icon={<Percent className="h-5 w-5" />}
          variant="violet"
          subtitle={t('mockKpis.ppVsPrev', { value: exec.laborCostTrend })}
        />
      </div>

      {/* Tabs by area */}
      <Tabs defaultValue="production" className="gap-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="production">{t('mockKpis.tabProduction')}</TabsTrigger>
          <TabsTrigger value="billing">{t('mockKpis.tabBilling')}</TabsTrigger>
          <TabsTrigger value="collections">{t('mockKpis.tabCollections')}</TabsTrigger>
          <TabsTrigger value="punch">{t('mockKpis.tabPunch')}</TabsTrigger>
          <TabsTrigger value="payroll">{t('mockKpis.tabPayroll')}</TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------ WO PRODUCTION */}
        <TabsContent value="production" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KPICard
              compact
              title={t('mockKpis.wosCompleted')}
              value={prod.woCompleted.toLocaleString()}
              icon={<CheckCheck className="h-5 w-5" />}
              variant="success"
              trend={{ value: prod.woCompletedTrend, label: t('mockKpis.vsPrev') }}
            />
            <KPICard
              compact
              title={t('mockKpis.avgCycleTime')}
              value={`${prod.avgCycleHours}h`}
              icon={<Clock className="h-5 w-5" />}
              variant="info"
              subtitle={t('mockKpis.createdToDone')}
            />
            <KPICard
              compact
              title={t('mockKpis.onTimeCompletion')}
              value={`${prod.onTimePct}%`}
              icon={<Target className="h-5 w-5" />}
              variant="default"
              subtitle={t('mockKpis.vsPromiseDate')}
            />
            <KPICard
              compact
              title={t('mockKpis.openBacklog')}
              value={prod.openBacklog}
              icon={<Layers className="h-5 w-5" />}
              variant="warning"
              subtitle={t('mockKpis.olderThan7Days', { count: prod.backlogOver7d })}
            />
            <KPICard
              compact
              title={t('mockKpis.pendingApproval')}
              value={prod.pendingApproval}
              icon={<ClipboardCheck className="h-5 w-5" />}
              variant="violet"
              subtitle={t('mockKpis.avgHoursToApprove', { hours: prod.avgApprovalHours })}
            />
            <KPICard
              compact
              title={t('mockKpis.inspectionFailRate')}
              value={`${prod.inspectionFailPct}%`}
              icon={<AlertTriangle className="h-5 w-5" />}
              variant="danger"
              subtitle={t('mockKpis.failedOverInspected')}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">{t('mockKpis.chartCompletedWosProduction')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="week" fontSize={12} />
                    <YAxis yAxisId="left" fontSize={12} />
                    <YAxis yAxisId="right" orientation="right" fontSize={12} tickFormatter={(v) => fmtMoneyK(v)} />
                    <Tooltip formatter={(value: number, name: string) => (name === t('mockKpis.chartProductionDollar') ? fmtMoney(value) : value)} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="woCompleted" name={t('mockKpis.chartWosDone')} fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" dataKey="productionValue" name={t('mockKpis.chartProductionDollar')} stroke="#22c55e" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">{t('mockKpis.chartOpenWoPipeline')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={woStatusPipeline} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3}>
                      {woStatusPipeline.map((s) => (
                        <Cell key={s.status} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{t('mockKpis.chartProductionVsGoal')}</CardTitle>
              <ExportButton
                data={dealerProduction.map((r) => ({
                  [t('dealer.label')]: r.dealer,
                  [t('mockKpis.tableWosDone')]: r.wos,
                  [t('mockKpis.tableProductionValue')]: r.value,
                  [t('mockKpis.tableGoal')]: r.goal,
                  [t('mockKpis.tableAttainmentPct')]: r.attainmentPct,
                }))}
                filename="kpi-production-by-dealer"
                title={t('mockKpis.chartProductionVsGoal')}
              />
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('dealer.label')}</TableHead>
                    <TableHead className="text-right">{t('mockKpis.tableWosDone')}</TableHead>
                    <TableHead className="text-right">{t('mockKpis.tableProductionValue')}</TableHead>
                    <TableHead className="text-right">{t('mockKpis.tableGoal')}</TableHead>
                    <TableHead className="text-right">{t('mockKpis.tableAttainment')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dealerProduction.map((r) => (
                    <TableRow key={r.dealer}>
                      <TableCell className="font-medium">{r.dealer}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.wos.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(r.value)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{fmtMoney(r.goal)}</TableCell>
                      <TableCell className="text-right"><AttainmentBadge pct={r.attainmentPct} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------ BILLING */}
        <TabsContent value="billing" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KPICard compact title={t('mockKpis.invoiced')} value={fmtMoneyK(billing.invoicedValue)} icon={<Receipt className="h-5 w-5" />} variant="success" trend={{ value: billing.invoicedTrend, label: t('mockKpis.vsPrev') }} />
            <KPICard compact title={t('mockKpis.statementsIssued')} value={billing.statementsIssued} icon={<FileText className="h-5 w-5" />} variant="default" subtitle={t('mockKpis.avgPerStatement', { amount: fmtMoney(billing.avgInvoiceValue) })} />
            <KPICard compact title={t('mockKpis.doneNotInvoiced')} value={billing.unbilledWos} icon={<Hourglass className="h-5 w-5" />} variant="danger" subtitle={t('mockKpis.unbilledRevenue', { amount: fmtMoney(billing.unbilledValue) })} />
            <KPICard compact title={t('mockKpis.woDoneToInvoiced')} value={`${billing.avgDoneToInvoicedDays}d`} icon={<CalendarClock className="h-5 w-5" />} variant="warning" subtitle={t('mockKpis.avgBillingLag')} />
            <KPICard compact title={t('mockKpis.statementsSent')} value={`${billing.sentPct}%`} icon={<Send className="h-5 w-5" />} variant="info" subtitle={t('mockKpis.neverSent', { count: billing.unsentStatements })} />
            <KPICard compact title={t('mockKpis.billingCoverage')} value={`${Math.round((billing.invoicedValue / exec.productionValue) * 1000) / 10}%`} icon={<Percent className="h-5 w-5" />} variant="violet" subtitle={t('mockKpis.invoicedOverProduction')} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">{t('mockKpis.chartInvoicedVsProduction')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="week" fontSize={12} />
                    <YAxis fontSize={12} tickFormatter={(v) => fmtMoneyK(v)} />
                    <Tooltip formatter={(value: number) => fmtMoney(value)} />
                    <Legend />
                    <Bar dataKey="productionValue" name={t('mockKpis.chartProductionDollar')} fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="invoicedValue" name={t('mockKpis.chartInvoicedDollar')} fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">{t('mockKpis.chartUnbilledAging')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={unbilledAging} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis type="number" fontSize={12} />
                    <YAxis type="category" dataKey="bucket" fontSize={12} width={80} />
                    <Tooltip formatter={(value: number, name: string) => (name === t('mockKpis.chartValueDollar') ? fmtMoney(value) : value)} />
                    <Legend />
                    <Bar dataKey="wos" name={t('mockKpis.chartWos')} fill="#f59e0b" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{t('mockKpis.chartUnbilledByDealer')}</CardTitle>
              <ExportButton
                data={UNBILLED_BY_DEALER.map((r) => ({
                  [t('dealer.label')]: r.dealer,
                  [t('mockKpis.chartWos')]: r.wos,
                  [t('mockKpis.tableProductionValue')]: r.value,
                  [t('mockKpis.tableOldestDays')]: r.oldestDays,
                }))}
                filename="kpi-unbilled-by-dealer"
                title={t('mockKpis.chartUnbilledByDealer')}
              />
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('dealer.label')}</TableHead>
                    <TableHead className="text-right">{t('mockKpis.tableUnbilledWos')}</TableHead>
                    <TableHead className="text-right">{t('mockKpis.tableUnbilledValue')}</TableHead>
                    <TableHead className="text-right">{t('mockKpis.tableOldestDays')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {UNBILLED_BY_DEALER.map((r) => (
                    <TableRow key={r.dealer}>
                      <TableCell className="font-medium">{r.dealer}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.wos}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(r.value)}</TableCell>
                      <TableCell className={cn('text-right tabular-nums font-semibold', r.oldestDays > 30 ? 'text-destructive' : r.oldestDays > 14 ? 'text-amber-600' : 'text-muted-foreground')}>
                        {r.oldestDays}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* -------------------------------------------------- COLLECTIONS */}
        <TabsContent value="collections" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KPICard compact title={t('mockKpis.outstandingAr')} value={fmtMoneyK(collections.outstandingAr)} icon={<Banknote className="h-5 w-5" />} variant="warning" subtitle={t('mockKpis.openStatements', { count: collections.openStatements })} />
            <KPICard compact title={t('mockKpis.dso')} value={`${collections.dsoDays}d`} icon={<CalendarClock className="h-5 w-5" />} variant="danger" subtitle={t('mockKpis.dsoVsPrevCheck', { value: collections.dsoTrend })} />
            <KPICard compact title={t('mockKpis.collected')} value={fmtMoneyK(collections.collectedValue)} icon={<DollarSign className="h-5 w-5" />} variant="success" trend={{ value: collections.collectedTrend, label: t('mockKpis.vsPrev') }} />
            <KPICard compact title={t('mockKpis.collectionRate')} value={`${collections.collectionRatePct}%`} icon={<Percent className="h-5 w-5" />} variant="info" subtitle={t('mockKpis.collectedOverInvoiced')} />
            <KPICard compact title={t('mockKpis.arOver60')} value={`${collections.arOver60Pct}%`} icon={<AlertTriangle className="h-5 w-5" />} variant="violet" subtitle={t('mockKpis.ofTotalOutstanding')} />
            <KPICard compact title={t('mockKpis.cashGap')} value={fmtMoneyK(collections.outstandingAr - billing.unbilledValue > 0 ? collections.outstandingAr + billing.unbilledValue : 0)} icon={<Hourglass className="h-5 w-5" />} variant="default" subtitle={t('mockKpis.arPlusUnbilled')} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">{t('mockKpis.chartArAging')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={arAging}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="bucket" fontSize={11} />
                    <YAxis fontSize={12} tickFormatter={(v) => fmtMoneyK(v)} />
                    <Tooltip formatter={(value: number) => fmtMoney(value)} />
                    <Bar dataKey="value" name={t('mockKpis.chartOutstandingDollar')} radius={[4, 4, 0, 0]}>
                      {arAging.map((b) => (
                        <Cell key={b.bucket} fill={b.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">{t('mockKpis.chartCollectedVsInvoiced')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="week" fontSize={12} />
                    <YAxis fontSize={12} tickFormatter={(v) => fmtMoneyK(v)} />
                    <Tooltip formatter={(value: number) => fmtMoney(value)} />
                    <Legend />
                    <Line dataKey="invoicedValue" name={t('mockKpis.chartInvoicedDollar')} stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                    <Line dataKey="collectedValue" name={t('mockKpis.chartCollectedDollar')} stroke="#22c55e" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{t('mockKpis.chartSlowestPayers')}</CardTitle>
              <ExportButton
                data={WORST_PAYERS.map((r) => ({
                  [t('dealer.label')]: r.dealer,
                  [t('mockKpis.tableOutstanding')]: r.outstanding,
                  [t('mockKpis.tableAvgDaysToPay')]: r.avgDaysToPay,
                  [t('mockKpis.tableOldestDays')]: r.oldestOpenDays,
                  [t('mockKpis.tableOpenStatements')]: r.openStatements,
                }))}
                filename="kpi-slowest-payers"
                title={t('mockKpis.chartSlowestPayers')}
              />
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('dealer.label')}</TableHead>
                    <TableHead className="text-right">{t('mockKpis.tableOutstanding')}</TableHead>
                    <TableHead className="text-right">{t('mockKpis.tableAvgDaysToPay')}</TableHead>
                    <TableHead className="text-right">{t('mockKpis.tableOldestOpen')}</TableHead>
                    <TableHead className="text-right">{t('mockKpis.tableOpenStatements')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {WORST_PAYERS.map((r) => (
                    <TableRow key={r.dealer}>
                      <TableCell className="font-medium">{r.dealer}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(r.outstanding)}</TableCell>
                      <TableCell className={cn('text-right tabular-nums font-semibold', r.avgDaysToPay > 45 ? 'text-destructive' : r.avgDaysToPay > 30 ? 'text-amber-600' : 'text-success')}>
                        {r.avgDaysToPay.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.oldestOpenDays}d</TableCell>
                      <TableCell className="text-right tabular-nums">{r.openStatements}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------ PUNCH QUALITY */}
        <TabsContent value="punch" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KPICard compact title={t('mockKpis.punchErrorRate')} value={`${punch.errorRatePct}%`} icon={<Fingerprint className="h-5 w-5" />} variant="danger" subtitle={t('mockKpis.errorRateOfPunches', { trend: punch.errorRateTrend, count: punch.totalPunches.toLocaleString() })} />
            <KPICard compact title={t('mockKpis.missingPunchOut')} value={punch.missingPunchOut} icon={<AlertTriangle className="h-5 w-5" />} variant="warning" subtitle={t('mockKpis.missingBreakEndSuffix', { count: punch.missingBreakEnd })} />
            <KPICard compact title={t('mockKpis.manualPunches')} value={punch.manualPunches} icon={<Pencil className="h-5 w-5" />} variant="violet" subtitle={t('mockKpis.createdByHand')} />
            <KPICard compact title={t('mockKpis.adminCorrections')} value={punch.adminCorrections} icon={<ClipboardCheck className="h-5 w-5" />} variant="info" subtitle={t('mockKpis.fixedByAdmins')} />
            <KPICard compact title={t('mockKpis.correctionDelay')} value={`${punch.avgCorrectionDelayDays}d`} icon={<Clock className="h-5 w-5" />} variant="default" subtitle={t('mockKpis.punchDateToFixed')} />
            <KPICard compact title={t('mockKpis.deletedPunches')} value={punch.deletedPunches} icon={<Trash2 className="h-5 w-5" />} variant="danger" subtitle={t('mockKpis.fromAuditLog')} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">{t('mockKpis.chartErrorsByType')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={punchErrorBreakdown} dataKey="count" nameKey="type" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3}>
                      {punchErrorBreakdown.map((s) => (
                        <Cell key={s.type} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">{t('mockKpis.chartErrorRateByWeek')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={errorRateSeries}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="week" fontSize={12} />
                    <YAxis fontSize={12} tickFormatter={(v) => `${v}%`} />
                    <Tooltip formatter={(value: number) => `${value}%`} />
                    <Line dataKey="errorRate" name={t('mockKpis.chartErrorRate')} stroke="#ef4444" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{t('mockKpis.chartPunchOffenders')}</CardTitle>
              <ExportButton
                data={PUNCH_OFFENDERS.map((r) => ({
                  [t('common.employee')]: r.employee,
                  [t('dealer.label')]: r.dealer,
                  [t('mockKpis.tableMissingOut')]: r.missingOut,
                  [t('mockKpis.tableManual')]: r.manual,
                  [t('mockKpis.tableCorrected')]: r.corrected,
                  [t('mockKpis.tableTotalIssues')]: r.total,
                }))}
                filename="kpi-punch-offenders"
                title={t('mockKpis.chartPunchOffenders')}
              />
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.employee')}</TableHead>
                    <TableHead>{t('dealer.label')}</TableHead>
                    <TableHead className="text-right">{t('mockKpis.tableMissingOut')}</TableHead>
                    <TableHead className="text-right">{t('mockKpis.tableManual')}</TableHead>
                    <TableHead className="text-right">{t('mockKpis.tableCorrected')}</TableHead>
                    <TableHead className="text-right">{t('mockKpis.tableTotalIssues')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {PUNCH_OFFENDERS.map((r) => (
                    <TableRow key={r.employee}>
                      <TableCell className="font-medium">{r.employee}</TableCell>
                      <TableCell className="text-muted-foreground">{r.dealer}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.missingOut}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.manual}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.corrected}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{r.total}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------- PAYROLL SPEND */}
        <TabsContent value="payroll" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KPICard compact title={t('mockKpis.totalPayroll')} value={fmtMoneyK(payroll.totalPayroll)} icon={<HandCoins className="h-5 w-5" />} variant="success" trend={{ value: payroll.payrollTrend, label: t('mockKpis.vsPrev') }} />
            <KPICard compact title={t('mockKpis.overtimeCost')} value={fmtMoneyK(payroll.overtimeCost)} icon={<Timer className="h-5 w-5" />} variant="warning" subtitle={t('mockKpis.pctOfPayroll', { pct: payroll.overtimePct })} />
            <KPICard compact title={t('mockKpis.laborCostRevenue')} value={`${payroll.laborCostPct}%`} icon={<Percent className="h-5 w-5" />} variant="violet" subtitle={t('mockKpis.payrollOverProduction')} />
            <KPICard compact title={t('mockKpis.costPerWo')} value={`$${payroll.avgCostPerWo.toFixed(2)}`} icon={<Wrench className="h-5 w-5" />} variant="info" subtitle={t('mockKpis.payrollOverCompletedWos')} />
            <KPICard compact title={t('mockCosts.activeEmployees')} value={payroll.activeEmployees} icon={<Users className="h-5 w-5" />} variant="default" subtitle={t('mockKpis.avgRatePerHour', { rate: payroll.avgHourlyRate })} />
            <KPICard compact title={t('mockKpis.revenuePerEmployee')} value={fmtMoneyK(Math.round(exec.productionValue / payroll.activeEmployees))} icon={<TrendingUp className="h-5 w-5" />} variant="success" subtitle={t('mockKpis.productionOverHeadcount')} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">{t('mockKpis.chartPayrollByType')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={payrollByType} dataKey="value" nameKey="type" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                      {payrollByType.map((s) => (
                        <Cell key={s.type} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => fmtMoney(value)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">{t('mockKpis.chartPayrollVsProduction')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={laborSeries}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="week" fontSize={12} />
                    <YAxis yAxisId="left" fontSize={12} tickFormatter={(v) => fmtMoneyK(v)} />
                    <YAxis yAxisId="right" orientation="right" fontSize={12} tickFormatter={(v) => `${v}%`} domain={[0, 40]} />
                    <Tooltip
                      formatter={(value: number, name: string) =>
                        name === t('mockKpis.chartLaborPct') ? `${value}%` : fmtMoney(value)
                      }
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="payroll" name={t('mockKpis.chartPayrollDollar')} fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="left" dataKey="production" name={t('mockKpis.chartProductionDollar')} fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" dataKey="laborPct" name={t('mockKpis.chartLaborPct')} stroke="#f59e0b" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{t('mockKpis.chartLaborByDealer')}</CardTitle>
              <ExportButton
                data={payrollByDealer.map((r) => ({
                  [t('dealer.label')]: r.dealer,
                  [t('mockKpis.tableHours')]: r.hours,
                  [t('mockKpis.tableOtHours')]: r.otHours,
                  [t('mockKpis.tableLaborCost')]: r.cost,
                  [t('mockKpis.tableCostPerWo')]: r.costPerWo,
                  [t('mockKpis.tableLaborPct')]: r.laborPct,
                }))}
                filename="kpi-labor-by-dealer"
                title={t('mockKpis.chartLaborByDealer')}
              />
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('dealer.label')}</TableHead>
                    <TableHead className="text-right">{t('mockKpis.tableHours')}</TableHead>
                    <TableHead className="text-right">{t('mockKpis.tableOtHours')}</TableHead>
                    <TableHead className="text-right">{t('mockKpis.tableLaborCost')}</TableHead>
                    <TableHead className="text-right">{t('mockKpis.tableCostPerWo')}</TableHead>
                    <TableHead className="text-right">{t('mockKpis.tableLaborPct')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payrollByDealer.map((r) => (
                    <TableRow key={r.dealer}>
                      <TableCell className="font-medium">{r.dealer}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.hours.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.otHours}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(r.cost)}</TableCell>
                      <TableCell className="text-right tabular-nums">${r.costPerWo.toFixed(2)}</TableCell>
                      <TableCell className={cn('text-right tabular-nums font-semibold', r.laborPct > 27 ? 'text-destructive' : r.laborPct > 25 ? 'text-amber-600' : 'text-success')}>
                        {r.laborPct.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Data lineage note */}
      <Card className="border-dashed bg-muted/30">
        <CardContent className="pt-4 pb-4 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5" /> {t('mockKpis.lineageTitle')}
          </p>
          <p>{t('mockKpis.lineageBody')}</p>
        </CardContent>
      </Card>
    </div>
  )
}
