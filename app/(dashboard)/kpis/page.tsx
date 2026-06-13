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
import { cn } from '@/lib/utils'
import {
  AR_AGING,
  KPI_PERIOD_OPTIONS,
  PUNCH_OFFENDERS,
  UNBILLED_AGING,
  UNBILLED_BY_DEALER,
  WO_STATUS_PIPELINE,
  WORST_PAYERS,
  getBillingKpis,
  getCollectionsKpis,
  getDealerProduction,
  getExecutiveSummary,
  getKpiSeries,
  getPayrollByDealer,
  getPayrollByType,
  getPayrollKpis,
  getProductionKpis,
  getPunchErrorBreakdown,
  getPunchQualityKpis,
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
  const [period, setPeriod] = useState<KpiPeriod>('4w')

  const series = getKpiSeries(period)
  const exec = getExecutiveSummary(period)
  const prod = getProductionKpis(period)
  const billing = getBillingKpis(period)
  const collections = getCollectionsKpis(period)
  const punch = getPunchQualityKpis(period)
  const payroll = getPayrollKpis(period)

  const dealerProduction = getDealerProduction(period)
  const punchErrorBreakdown = getPunchErrorBreakdown(period)
  const payrollByType = getPayrollByType(period)
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
            Business KPIs
            <Badge variant="outline" className="border-violet-300 bg-violet-50 text-violet-700">
              DEV
            </Badge>
          </h1>
          <p className="text-muted-foreground mt-1">
            Production, billing, collections, punch quality and payroll spend — mock data modeled on the SRS database
          </p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as KpiPeriod)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KPI_PERIOD_OPTIONS.map((o) => (
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
          title="Production Value"
          value={fmtMoneyK(exec.productionValue)}
          icon={<Wrench className="h-5 w-5" />}
          variant="success"
          trend={{ value: exec.productionTrend, label: 'vs prev' }}
        />
        <KPICard
          compact
          title="WOs Completed"
          value={exec.woCompleted.toLocaleString()}
          icon={<CheckCheck className="h-5 w-5" />}
          variant="default"
          trend={{ value: exec.woTrend, label: 'vs prev' }}
        />
        <KPICard
          compact
          title="Invoiced"
          value={fmtMoneyK(exec.invoicedValue)}
          icon={<Receipt className="h-5 w-5" />}
          variant="info"
          trend={{ value: exec.invoicedTrend, label: 'vs prev' }}
        />
        <KPICard
          compact
          title="DSO (Days to Collect)"
          value={`${exec.dsoDays}d`}
          icon={<CalendarClock className="h-5 w-5" />}
          variant="warning"
          subtitle={`${exec.dsoTrend}d vs prev — lower is better`}
        />
        <KPICard
          compact
          title="Punch Error Rate"
          value={`${exec.punchErrorRate}%`}
          icon={<Fingerprint className="h-5 w-5" />}
          variant="danger"
          subtitle={`${exec.punchErrorTrend}pp vs prev`}
        />
        <KPICard
          compact
          title="Labor Cost / Revenue"
          value={`${exec.laborCostPct}%`}
          icon={<Percent className="h-5 w-5" />}
          variant="violet"
          subtitle={`${exec.laborCostTrend}pp vs prev`}
        />
      </div>

      {/* Tabs by area */}
      <Tabs defaultValue="production" className="gap-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="production">WO Production</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="collections">Collections</TabsTrigger>
          <TabsTrigger value="punch">Punch Quality</TabsTrigger>
          <TabsTrigger value="payroll">Payroll Spend</TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------ WO PRODUCTION */}
        <TabsContent value="production" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KPICard
              compact
              title="WOs Completed"
              value={prod.woCompleted.toLocaleString()}
              icon={<CheckCheck className="h-5 w-5" />}
              variant="success"
              trend={{ value: prod.woCompletedTrend, label: 'vs prev' }}
            />
            <KPICard
              compact
              title="Avg Cycle Time"
              value={`${prod.avgCycleHours}h`}
              icon={<Clock className="h-5 w-5" />}
              variant="info"
              subtitle="Created → Done"
            />
            <KPICard
              compact
              title="On-Time Completion"
              value={`${prod.onTimePct}%`}
              icon={<Target className="h-5 w-5" />}
              variant="default"
              subtitle="vs promise date"
            />
            <KPICard
              compact
              title="Open Backlog"
              value={prod.openBacklog}
              icon={<Layers className="h-5 w-5" />}
              variant="warning"
              subtitle={`${prod.backlogOver7d} older than 7 days`}
            />
            <KPICard
              compact
              title="Pending Approval"
              value={prod.pendingApproval}
              icon={<ClipboardCheck className="h-5 w-5" />}
              variant="violet"
              subtitle={`avg ${prod.avgApprovalHours}h to approve`}
            />
            <KPICard
              compact
              title="Inspection Fail Rate"
              value={`${prod.inspectionFailPct}%`}
              icon={<AlertTriangle className="h-5 w-5" />}
              variant="danger"
              subtitle="failed / inspected WOs"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">Completed WOs & Production Value by Week</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="week" fontSize={12} />
                    <YAxis yAxisId="left" fontSize={12} />
                    <YAxis yAxisId="right" orientation="right" fontSize={12} tickFormatter={(v) => fmtMoneyK(v)} />
                    <Tooltip formatter={(value: number, name: string) => (name === 'Production $' ? fmtMoney(value) : value)} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="woCompleted" name="WOs Done" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" dataKey="productionValue" name="Production $" stroke="#22c55e" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">Open WO Pipeline (now)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={WO_STATUS_PIPELINE} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3}>
                      {WO_STATUS_PIPELINE.map((s) => (
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
              <CardTitle className="text-base">Production vs Goal by Dealer</CardTitle>
              <ExportButton
                data={dealerProduction.map((r) => ({ Dealer: r.dealer, 'WOs': r.wos, 'Value': r.value, 'Goal': r.goal, 'Attainment %': r.attainmentPct }))}
                filename="kpi-production-by-dealer"
                title="Production vs Goal by Dealer"
              />
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dealer</TableHead>
                    <TableHead className="text-right">WOs Done</TableHead>
                    <TableHead className="text-right">Production Value</TableHead>
                    <TableHead className="text-right">Goal</TableHead>
                    <TableHead className="text-right">Attainment</TableHead>
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
            <KPICard
              compact
              title="Invoiced"
              value={fmtMoneyK(billing.invoicedValue)}
              icon={<Receipt className="h-5 w-5" />}
              variant="success"
              trend={{ value: billing.invoicedTrend, label: 'vs prev' }}
            />
            <KPICard
              compact
              title="Statements Issued"
              value={billing.statementsIssued}
              icon={<FileText className="h-5 w-5" />}
              variant="default"
              subtitle={`avg ${fmtMoney(billing.avgInvoiceValue)} / statement`}
            />
            <KPICard
              compact
              title="Done, Not Invoiced"
              value={billing.unbilledWos}
              icon={<Hourglass className="h-5 w-5" />}
              variant="danger"
              subtitle={`${fmtMoney(billing.unbilledValue)} unbilled revenue`}
            />
            <KPICard
              compact
              title="WO Done → Invoiced"
              value={`${billing.avgDoneToInvoicedDays}d`}
              icon={<CalendarClock className="h-5 w-5" />}
              variant="warning"
              subtitle="avg billing lag"
            />
            <KPICard
              compact
              title="Statements Sent"
              value={`${billing.sentPct}%`}
              icon={<Send className="h-5 w-5" />}
              variant="info"
              subtitle={`${billing.unsentStatements} created but never sent`}
            />
            <KPICard
              compact
              title="Billing Coverage"
              value={`${Math.round((billing.invoicedValue / exec.productionValue) * 1000) / 10}%`}
              icon={<Percent className="h-5 w-5" />}
              variant="violet"
              subtitle="invoiced / production value"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">Invoiced vs Production Value by Week</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="week" fontSize={12} />
                    <YAxis fontSize={12} tickFormatter={(v) => fmtMoneyK(v)} />
                    <Tooltip formatter={(value: number) => fmtMoney(value)} />
                    <Legend />
                    <Bar dataKey="productionValue" name="Production $" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="invoicedValue" name="Invoiced $" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">Unbilled WOs Aging (now)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={UNBILLED_AGING} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis type="number" fontSize={12} />
                    <YAxis type="category" dataKey="bucket" fontSize={12} width={80} />
                    <Tooltip formatter={(value: number, name: string) => (name === 'Value $' ? fmtMoney(value) : value)} />
                    <Legend />
                    <Bar dataKey="wos" name="WOs" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Unbilled Work by Dealer (Done WOs not in any statement)</CardTitle>
              <ExportButton
                data={UNBILLED_BY_DEALER.map((r) => ({ Dealer: r.dealer, 'WOs': r.wos, 'Value': r.value, 'Oldest (days)': r.oldestDays }))}
                filename="kpi-unbilled-by-dealer"
                title="Unbilled Work by Dealer"
              />
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dealer</TableHead>
                    <TableHead className="text-right">Unbilled WOs</TableHead>
                    <TableHead className="text-right">Unbilled Value</TableHead>
                    <TableHead className="text-right">Oldest (days)</TableHead>
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
            <KPICard
              compact
              title="Outstanding AR"
              value={fmtMoneyK(collections.outstandingAr)}
              icon={<Banknote className="h-5 w-5" />}
              variant="warning"
              subtitle={`${collections.openStatements} open statements`}
            />
            <KPICard
              compact
              title="DSO"
              value={`${collections.dsoDays}d`}
              icon={<CalendarClock className="h-5 w-5" />}
              variant="danger"
              subtitle={`${collections.dsoTrend}d vs prev — statement → check`}
            />
            <KPICard
              compact
              title="Collected"
              value={fmtMoneyK(collections.collectedValue)}
              icon={<DollarSign className="h-5 w-5" />}
              variant="success"
              trend={{ value: collections.collectedTrend, label: 'vs prev' }}
            />
            <KPICard
              compact
              title="Collection Rate"
              value={`${collections.collectionRatePct}%`}
              icon={<Percent className="h-5 w-5" />}
              variant="info"
              subtitle="collected / invoiced"
            />
            <KPICard
              compact
              title="AR Over 60 Days"
              value={`${collections.arOver60Pct}%`}
              icon={<AlertTriangle className="h-5 w-5" />}
              variant="violet"
              subtitle="of total outstanding"
            />
            <KPICard
              compact
              title="Cash Gap"
              value={fmtMoneyK(collections.outstandingAr - billing.unbilledValue > 0 ? collections.outstandingAr + billing.unbilledValue : 0)}
              icon={<Hourglass className="h-5 w-5" />}
              variant="default"
              subtitle="AR + unbilled work"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">AR Aging (now)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={AR_AGING}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="bucket" fontSize={11} />
                    <YAxis fontSize={12} tickFormatter={(v) => fmtMoneyK(v)} />
                    <Tooltip formatter={(value: number) => fmtMoney(value)} />
                    <Bar dataKey="value" name="Outstanding $" radius={[4, 4, 0, 0]}>
                      {AR_AGING.map((b) => (
                        <Cell key={b.bucket} fill={b.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">Collected vs Invoiced by Week</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="week" fontSize={12} />
                    <YAxis fontSize={12} tickFormatter={(v) => fmtMoneyK(v)} />
                    <Tooltip formatter={(value: number) => fmtMoney(value)} />
                    <Legend />
                    <Line dataKey="invoicedValue" name="Invoiced $" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line dataKey="collectedValue" name="Collected $" stroke="#22c55e" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Slowest Payers</CardTitle>
              <ExportButton
                data={WORST_PAYERS.map((r) => ({ Dealer: r.dealer, 'Outstanding': r.outstanding, 'Avg Days to Pay': r.avgDaysToPay, 'Oldest Open (days)': r.oldestOpenDays, 'Open Statements': r.openStatements }))}
                filename="kpi-slowest-payers"
                title="Slowest Payers"
              />
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dealer</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Avg Days to Pay</TableHead>
                    <TableHead className="text-right">Oldest Open</TableHead>
                    <TableHead className="text-right">Open Statements</TableHead>
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
            <KPICard
              compact
              title="Punch Error Rate"
              value={`${punch.errorRatePct}%`}
              icon={<Fingerprint className="h-5 w-5" />}
              variant="danger"
              subtitle={`${punch.errorRateTrend}pp vs prev — of ${punch.totalPunches.toLocaleString()} punches`}
            />
            <KPICard
              compact
              title="Missing Punch-Out"
              value={punch.missingPunchOut}
              icon={<AlertTriangle className="h-5 w-5" />}
              variant="warning"
              subtitle={`+ ${punch.missingBreakEnd} missing break end`}
            />
            <KPICard
              compact
              title="Manual Punches"
              value={punch.manualPunches}
              icon={<Pencil className="h-5 w-5" />}
              variant="violet"
              subtitle="created by hand"
            />
            <KPICard
              compact
              title="Admin Corrections"
              value={punch.adminCorrections}
              icon={<ClipboardCheck className="h-5 w-5" />}
              variant="info"
              subtitle="punches fixed by admins"
            />
            <KPICard
              compact
              title="Correction Delay"
              value={`${punch.avgCorrectionDelayDays}d`}
              icon={<Clock className="h-5 w-5" />}
              variant="default"
              subtitle="punch date → fixed"
            />
            <KPICard
              compact
              title="Deleted Punches"
              value={punch.deletedPunches}
              icon={<Trash2 className="h-5 w-5" />}
              variant="danger"
              subtitle="from punch audit log"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">Errors by Type</CardTitle>
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
                <CardTitle className="text-base">Error Rate by Week</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={errorRateSeries}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="week" fontSize={12} />
                    <YAxis fontSize={12} tickFormatter={(v) => `${v}%`} />
                    <Tooltip formatter={(value: number) => `${value}%`} />
                    <Line dataKey="errorRate" name="Error Rate" stroke="#ef4444" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Employees With Most Punch Issues</CardTitle>
              <ExportButton
                data={PUNCH_OFFENDERS.map((r) => ({ Employee: r.employee, Dealer: r.dealer, 'Missing Out': r.missingOut, 'Manual': r.manual, 'Corrected': r.corrected, 'Total': r.total }))}
                filename="kpi-punch-offenders"
                title="Employees With Most Punch Issues"
              />
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Dealer</TableHead>
                    <TableHead className="text-right">Missing Out</TableHead>
                    <TableHead className="text-right">Manual</TableHead>
                    <TableHead className="text-right">Corrected</TableHead>
                    <TableHead className="text-right">Total Issues</TableHead>
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
            <KPICard
              compact
              title="Total Payroll"
              value={fmtMoneyK(payroll.totalPayroll)}
              icon={<HandCoins className="h-5 w-5" />}
              variant="success"
              trend={{ value: payroll.payrollTrend, label: 'vs prev' }}
            />
            <KPICard
              compact
              title="Overtime Cost"
              value={fmtMoneyK(payroll.overtimeCost)}
              icon={<Timer className="h-5 w-5" />}
              variant="warning"
              subtitle={`${payroll.overtimePct}% of payroll`}
            />
            <KPICard
              compact
              title="Labor Cost / Revenue"
              value={`${payroll.laborCostPct}%`}
              icon={<Percent className="h-5 w-5" />}
              variant="violet"
              subtitle="payroll / production value"
            />
            <KPICard
              compact
              title="Cost per WO"
              value={`$${payroll.avgCostPerWo.toFixed(2)}`}
              icon={<Wrench className="h-5 w-5" />}
              variant="info"
              subtitle="payroll / completed WOs"
            />
            <KPICard
              compact
              title="Active Employees"
              value={payroll.activeEmployees}
              icon={<Users className="h-5 w-5" />}
              variant="default"
              subtitle={`avg rate $${payroll.avgHourlyRate}/h`}
            />
            <KPICard
              compact
              title="Revenue per Employee"
              value={fmtMoneyK(Math.round(exec.productionValue / payroll.activeEmployees))}
              icon={<TrendingUp className="h-5 w-5" />}
              variant="success"
              subtitle="production / headcount"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">Payroll by Payment Type</CardTitle>
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
                <CardTitle className="text-base">Payroll vs Production Value by Week</CardTitle>
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
                        name === 'Labor %' ? `${value}%` : fmtMoney(value)
                      }
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="payroll" name="Payroll $" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="left" dataKey="production" name="Production $" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" dataKey="laborPct" name="Labor %" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Labor Cost by Dealer</CardTitle>
              <ExportButton
                data={payrollByDealer.map((r) => ({ Dealer: r.dealer, 'Hours': r.hours, 'OT Hours': r.otHours, 'Cost': r.cost, 'Cost per WO': r.costPerWo, 'Labor %': r.laborPct }))}
                filename="kpi-labor-by-dealer"
                title="Labor Cost by Dealer"
              />
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dealer</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead className="text-right">OT Hours</TableHead>
                    <TableHead className="text-right">Labor Cost</TableHead>
                    <TableHead className="text-right">Cost / WO</TableHead>
                    <TableHead className="text-right">Labor %</TableHead>
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
            <Building2 className="h-3.5 w-3.5" /> Data lineage (when wired to real APIs)
          </p>
          <p>
            <span className="font-medium">Production:</span> INVOICE + WORKFLOW (Waiting/In Process/Pause/In Transit/Done), promise_datetime, approved_date, inspected ·{' '}
            <span className="font-medium">Billing:</span> INVOICE_STATEMENT (fecha_create, sended, last_sended) vs Done WOs ·{' '}
            <span className="font-medium">Collections:</span> BILLING + BILLING_WO_REL check date vs statement date (DSO, aging) ·{' '}
            <span className="font-medium">Punch Quality:</span> TTK_EMPLOYEE_WORK (punch_out null, manual_create, fixed_at/fixed_by) + punch audit log ·{' '}
            <span className="font-medium">Payroll:</span> type_payment (hourly/piecework/salary/flat/daily/holiday/sick), hourly_rate, OT split
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
