'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowRight,
  Activity,
  CheckCheck,
  DollarSign,
  Hand,
  Hash,
  LogOut,
  Percent,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { KPICard, type KPICardVariant } from '@/components/dashboard/kpi-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DashboardYesterdayIssuesTable } from '@/components/dashboard/dashboard-yesterday-issues-table'
import { useFilters } from '@/lib/filter-context'
import { useTtkDashboardSummary } from '@/hooks/use-ttk-dashboard-summary'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { canDeletePunch } from '@/lib/auth/ttk-permissions'

const COLORS = ['#ef4444', '#f59e0b', '#8b5cf6']

type IssueType =
  | 'only_error'
  | 'only_error_clockout'
  | 'manual_punch'
  | 'only_deletes'
  | 'without_salary'
  | 'only_fixed'

interface DashboardKpiConfig {
  key: IssueType | 'total_punches' | 'error_rate'
  title: string
  icon: React.ReactNode
  variant: KPICardVariant
  issueType?: IssueType
  getValue: (args: {
    totalPunches: number
    errorRate: number
    counts: ReturnType<typeof useTtkDashboardSummary>['summary']['counts']
  }) => string | number
  subtitle?: (args: {
    totalPunches: number
    counts: ReturnType<typeof useTtkDashboardSummary>['summary']['counts']
  }) => React.ReactNode
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
}

export default function DashboardPage() {
  const router = useRouter()
  const { search, selectedDealers, dateRange, filtersHydrated, setSelectedType } = useFilters()
  const { user, hasPermission } = useSrsMe()
  const canViewDeleted = canDeletePunch(hasPermission, user?.isSystemAdmin)

  const { summary, loading } = useTtkDashboardSummary({
    search,
    selectedDealers,
    dateRange,
    filtersHydrated,
  })

  const { counts } = summary
  const totalPunches = counts.total_punches ?? 0
  const totalErrors = counts.only_error.pending
  const errorRate =
    totalPunches > 0 ? Math.round((totalErrors / totalPunches) * 1000) / 10 : 0

  const kpiCards: DashboardKpiConfig[] = useMemo(() => {
    const cards: DashboardKpiConfig[] = [
      {
        key: 'total_punches',
        title: 'Total punches',
        icon: <Hash className="h-7 w-7" />,
        variant: 'default',
        getValue: ({ totalPunches }) => totalPunches,
        subtitle: ({ counts }) => `${counts.only_error.pending} with errors in period`,
      },
      {
        key: 'only_error',
        title: 'With errors',
        icon: <AlertTriangle className="h-7 w-7" />,
        variant: 'warning',
        issueType: 'only_error',
        getValue: ({ counts }) => counts.only_error.pending,
        subtitle: ({ counts }) => {
          const bt = counts.only_error.by_type
          if (!bt) return null
          return (
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]">
              <span>
                Clock out:{' '}
                <span className="font-medium text-foreground">{bt.clock_out_missing}</span>
              </span>
              <span>
                Break: <span className="font-medium text-foreground">{bt.break_missing}</span>
              </span>
              <span>
                20h+: <span className="font-medium text-foreground">{bt.shift_20h_plus}</span>
              </span>
            </div>
          )
        },
      },
      {
        key: 'error_rate',
        title: 'Error rate',
        icon: <Percent className="h-7 w-7" />,
        variant: 'danger',
        issueType: 'only_error',
        getValue: ({ errorRate }) => `${errorRate}%`,
        subtitle: () => 'Errors / active punches',
      },
      {
        key: 'only_error_clockout',
        title: 'Without clock out',
        icon: <LogOut className="h-7 w-7" />,
        variant: 'danger',
        issueType: 'only_error_clockout',
        getValue: ({ counts }) => counts.only_error_clockout.pending,
      },
      {
        key: 'manual_punch',
        title: 'Manual punch',
        icon: <Hand className="h-7 w-7" />,
        variant: 'info',
        issueType: 'manual_punch',
        getValue: ({ counts }) => counts.manual_punch.pending,
      },
      {
        key: 'without_salary',
        title: 'Without salary',
        icon: <DollarSign className="h-7 w-7" />,
        variant: 'success',
        issueType: 'without_salary',
        getValue: ({ counts }) => counts.without_salary.pending,
      },
      {
        key: 'only_fixed',
        title: 'Corrected punches',
        icon: <CheckCheck className="h-7 w-7" />,
        variant: 'info',
        issueType: 'only_fixed',
        getValue: ({ counts }) => counts.only_fixed.pending,
      },
    ]

    if (canViewDeleted) {
      cards.push({
        key: 'only_deletes',
        title: 'Deleted punches',
        icon: <Trash2 className="h-7 w-7" />,
        variant: 'violet',
        issueType: 'only_deletes',
        getValue: ({ counts }) => counts.only_deletes.pending,
      })
    }

    return cards
  }, [canViewDeleted])

  const trendData = useMemo(
    () =>
      summary.error_trend.map((point) => ({
        ...point,
        displayDate: point.date ? format(parseISO(point.date), 'MMM dd') : '',
      })),
    [summary.error_trend],
  )

  const issueDistribution = useMemo(() => {
    const bt = counts.only_error.by_type
    if (!bt || totalErrors === 0) return []
    return [
      { type: 'clock_out_missing', label: 'Without clock out', count: bt.clock_out_missing },
      { type: 'break_missing', label: 'Break missing', count: bt.break_missing },
      { type: 'shift_20h_plus', label: 'Shift 20h+', count: bt.shift_20h_plus },
    ]
      .filter((d) => d.count > 0)
      .map((d) => ({
        ...d,
        percentage: Math.round((d.count / totalErrors) * 100),
      }))
  }, [counts.only_error.by_type, totalErrors])

  const goToIssues = (issueType: IssueType) => {
    setSelectedType(issueType)
    router.push('/issues')
  }

  const scopeReady = filtersHydrated && selectedDealers.length > 0

  return (
    <motion.div className="space-y-8" variants={container} initial="hidden" animate="show">
      <motion.div variants={item}>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Executive summary of punch validation for selected dealers and date range
        </p>
      </motion.div>

      {!scopeReady ? (
        <motion.p variants={item} className="text-sm text-muted-foreground">
          Select dealers in the header to load dashboard metrics.
        </motion.p>
      ) : null}

      <motion.div
        variants={item}
        className={`grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${
          kpiCards.length >= 8 ? '2xl:grid-cols-4' : ''
        }`}
      >
        {kpiCards.map((card) => (
          <KPICard
            key={card.key}
            title={card.title}
            value={card.getValue({ totalPunches, errorRate, counts })}
            subtitle={card.subtitle?.({ totalPunches, counts })}
            icon={card.icon}
            variant={card.variant}
            loading={loading}
            onClick={card.issueType ? () => goToIssues(card.issueType!) : undefined}
          />
        ))}
      </motion.div>

      <motion.div variants={item} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden border-blue-100 bg-gradient-to-br from-white to-blue-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              Error trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                Loading…
              </div>
            ) : trendData.length === 0 ? (
              <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                No errors in the selected period
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="colorClockOut" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorBreak" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="color20h" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="displayDate"
                      stroke="#64748b"
                      fontSize={12}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis stroke="#64748b" fontSize={12} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        color: '#0f172a',
                        boxShadow: '0 10px 40px -10px rgb(0 0 0 / 0.15)',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Area
                      type="monotone"
                      dataKey="clock_out_missing"
                      name="Without clock out"
                      stroke="#ef4444"
                      strokeWidth={2}
                      fill="url(#colorClockOut)"
                    />
                    <Area
                      type="monotone"
                      dataKey="break_missing"
                      name="Break missing"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      fill="url(#colorBreak)"
                    />
                    <Area
                      type="monotone"
                      dataKey="shift_20h_plus"
                      name="Shift 20h+"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      fill="url(#color20h)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-cyan-100 bg-gradient-to-br from-white to-cyan-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                <Activity className="h-4 w-4 text-accent" />
              </div>
              Error distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                Loading…
              </div>
            ) : issueDistribution.length === 0 ? (
              <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                No errors to display
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={issueDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="count"
                      nameKey="label"
                      label={({ percentage }) => `${percentage}%`}
                      labelLine={false}
                      strokeWidth={0}
                    >
                      {issueDistribution.map((entry, index) => (
                        <Cell key={entry.type} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        color: '#0f172a',
                        boxShadow: '0 10px 40px -10px rgb(0 0 0 / 0.15)',
                      }}
                    />
                    <Legend
                      formatter={(value) => (
                        <span className="text-xs text-muted-foreground">{value}</span>
                      )}
                      wrapperStyle={{ fontSize: '11px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={item} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="overflow-hidden border-red-100 bg-gradient-to-br from-white to-red-50/50">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10">
                <TrendingDown className="h-4 w-4 text-destructive" />
              </div>
              Dealers with most errors
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : summary.top_dealers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No dealer errors in this period</p>
            ) : (
              <div className="space-y-4">
                {summary.top_dealers.map((dealerItem, index) => (
                  <motion.div
                    key={dealerItem.id_dealer}
                    className="flex items-center justify-between rounded-xl bg-muted/30 p-3 transition-colors hover:bg-muted/50"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold ${
                          index === 0
                            ? 'bg-destructive/20 text-destructive'
                            : index === 1
                              ? 'bg-warning/20 text-warning'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        #{index + 1}
                      </span>
                      <p className="text-sm font-medium text-foreground">{dealerItem.dealer_name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold tabular-nums text-destructive">
                        {dealerItem.error_count}
                      </span>
                      <span className="text-xs text-muted-foreground">errors</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-slate-100 bg-gradient-to-br from-white to-slate-50/80 lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <AlertTriangle className="h-4 w-4 text-primary" />
              </div>
              Yesterday&apos;s punch issues
            </CardTitle>
            <Link
              href="/issues"
              className="flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80"
              onClick={() => setSelectedType('only_error')}
            >
              View all
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent className="min-w-0">
            <DashboardYesterdayIssuesTable />
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
