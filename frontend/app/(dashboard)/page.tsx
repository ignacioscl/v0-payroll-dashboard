'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { enUS, es } from 'date-fns/locale'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowRight,
  Activity,
  CheckCheck,
  DollarSign,
  Hand,
  Hash,
  LayoutDashboard,
  LogOut,
  Percent,
  Coffee,
  Timer,
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
import { PageHeading } from '@/components/layout/page-heading'
import { KPICard, type KPICardVariant } from '@/components/dashboard/kpi-card'
import { TodayStatusSection } from '@/components/dashboard/today-status-section'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DashboardYesterdayIssuesTable } from '@/components/dashboard/dashboard-yesterday-issues-table'
import { useFilters } from '@/lib/filter-context'
import { errorTypesWithState } from '@/lib/ttk/error-type-meta'
import { useTtkDashboardSummary } from '@/hooks/use-ttk-dashboard-summary'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { canDeletePunch } from '@/lib/auth/ttk-permissions'
import { useTranslation } from '@/lib/i18n/locale-context'
import { getDashboardKpiTitle } from '@/lib/i18n/label-helpers'

/**
 * Claves que dibuja cada posición del toggle. Fuera del componente para que la
 * referencia sea estable entre renders: el toggle sólo intercambia dataKeys, no
 * vuelve a pedir datos.
 */
const TREND_DATA_KEYS = {
  pending: {
    clockOut: 'clock_out_missing',
    breakMissing: 'break_missing',
    shift20h: 'shift_20h_plus',
  },
  all: {
    clockOut: 'clock_out_missing_all',
    breakMissing: 'break_missing_all',
    shift20h: 'shift_20h_plus_all',
  },
  solved: {
    clockOut: 'clock_out_missing_fixed',
    breakMissing: 'break_missing_fixed',
    shift20h: 'shift_20h_plus_fixed',
  },
} as const

type TrendMode = keyof typeof TREND_DATA_KEYS

// Los colores de los tipos de error viven en ERROR_TYPE_META, atados al código.
// El array por posición que había acá era justo el que pintaba mal el donut.

/** Referencia estable para el ranking vacío. */
const EMPTY_TOP_DEALERS: never[] = []

/** Ícono y variante de cada tipo de error, por código (no por posición). */
const DASH_ERROR_TYPE_ICONS: Record<1 | 2 | 3, React.ReactNode> = {
  1: <LogOut className="h-5 w-5" />,
  2: <Coffee className="h-5 w-5" />,
  3: <Timer className="h-5 w-5" />,
}

const DASH_ERROR_TYPE_VARIANTS: Record<1 | 2 | 3, KPICardVariant> = {
  1: 'danger',
  2: 'warning',
  3: 'violet',
}

type ErrorTypeLegendSlice = {
  code: number
  label: string
  color: string
  included: boolean
}

/**
 * Leyenda fija de los tres tipos, para el trend y el donut.
 *
 * La leyenda automática de recharts se arma con las series efectivamente
 * dibujadas, así que el tipo excluido desaparecía del gráfico Y de la leyenda:
 * quedaba un gráfico con menos cosas sin ninguna pista de que faltaba algo. Acá
 * los tres quedan siempre y el excluido va tachado, que es lo mismo que hacen la
 * tarjeta y el contador.
 *
 * Se pasa por `content` y no se renderiza suelto abajo para que recharts la siga
 * midiendo y posicionando dentro del área del gráfico.
 */
function ErrorTypeLegend({ slices }: { slices: readonly ErrorTypeLegendSlice[] }) {
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-1 text-[11px]">
      {slices.map((s) => (
        <li key={s.code} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: s.color, opacity: s.included ? 1 : 0.3 }}
          />
          <span
            className={
              s.included
                ? 'text-muted-foreground'
                : 'text-muted-foreground/60 line-through decoration-1'
            }
          >
            {s.label}
          </span>
        </li>
      ))}
    </ul>
  )
}

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
    /** Ya proyectado a 0 cuando no hay tipos incluidos. */
    totalErrors: number
    counts: ReturnType<typeof useTtkDashboardSummary>['summary']['counts']
  }) => string | number
  subtitle?: (args: {
    totalPunches: number
    totalErrors: number
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
  const { t, locale } = useTranslation()
  const dateFnsLocale = locale === 'es' ? es : enUS
  const {
    search,
    selectedDealers,
    dateRange,
    filtersHydrated,
    setSelectedType,
    includedErrorTypes,
    toggleErrorType,
    errorTypesReady,
  } = useFilters()
  const { user, hasPermission } = useSrsMe()
  const canViewDeleted = canDeletePunch(hasPermission, user?.isSystemAdmin)

  const { summary, loading } = useTtkDashboardSummary({
    includedErrorTypes,
    errorTypesReady,
    search,
    selectedDealers,
    dateRange,
    filtersHydrated,
  })

  const { counts } = summary
  const totalPunches = counts.total_punches ?? 0
  // Ver comentario en issues/page.tsx: con la lista vacía el backend responde con
  // los agregados completos y la proyección a cero la hace el cliente.
  const noErrorTypes = includedErrorTypes.length === 0
  const totalErrors = noErrorTypes ? 0 : counts.only_error.pending
  const errorRate =
    !noErrorTypes && totalPunches > 0
      ? Math.round((totalErrors / totalPunches) * 1000) / 10
      : 0
  const topDealers = noErrorTypes ? EMPTY_TOP_DEALERS : summary.top_dealers

  const kpiCards: DashboardKpiConfig[] = useMemo(() => {
    const cards: DashboardKpiConfig[] = [
      {
        key: 'total_punches',
        title: getDashboardKpiTitle(t, 'total_punches'),
        icon: <Hash className="h-7 w-7" />,
        variant: 'default',
        getValue: ({ totalPunches }) => totalPunches,
        // Proyectado: con los tres tipos destildados el backend responde con el
        // agregado completo y el cero lo pone el cliente.
        subtitle: ({ totalErrors }) => t('punch.withErrorsInPeriod', { count: totalErrors }),
      },
      {
        key: 'only_error',
        title: getDashboardKpiTitle(t, 'only_error'),
        icon: <AlertTriangle className="h-7 w-7" />,
        variant: 'warning',
        issueType: 'only_error',
        getValue: ({ totalErrors }) => totalErrors,
        subtitle: ({ counts }) => {
          const bt = counts.only_error.by_type
          if (!bt) return null
          return (
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]">
              <span>
                {t('punch.clockOutBreakdown')}{' '}
                <span className="font-medium text-foreground">{bt.clock_out_missing}</span>
              </span>
              <span>
                {t('punch.breakBreakdown')}{' '}
                <span className="font-medium text-foreground">{bt.break_missing}</span>
              </span>
              <span>
                {t('punch.shift20hBreakdown')}{' '}
                <span className="font-medium text-foreground">{bt.shift_20h_plus}</span>
              </span>
            </div>
          )
        },
      },
      {
        key: 'error_rate',
        title: getDashboardKpiTitle(t, 'error_rate'),
        icon: <Percent className="h-7 w-7" />,
        variant: 'danger',
        issueType: 'only_error',
        getValue: ({ errorRate }) => `${errorRate}%`,
        subtitle: () => t('punch.errorsOverActive'),
      },
      {
        key: 'manual_punch',
        title: getDashboardKpiTitle(t, 'manual_punch'),
        icon: <Hand className="h-7 w-7" />,
        variant: 'info',
        issueType: 'manual_punch',
        getValue: ({ counts }) => counts.manual_punch.pending,
      },
      {
        key: 'without_salary',
        title: getDashboardKpiTitle(t, 'without_salary'),
        icon: <DollarSign className="h-7 w-7" />,
        variant: 'success',
        issueType: 'without_salary',
        getValue: ({ counts }) => counts.without_salary.pending,
      },
      {
        key: 'only_fixed',
        title: getDashboardKpiTitle(t, 'only_fixed'),
        icon: <CheckCheck className="h-7 w-7" />,
        variant: 'info',
        issueType: 'only_fixed',
        getValue: ({ counts }) => counts.only_fixed.pending,
      },
    ]

    if (canViewDeleted) {
      cards.push({
        key: 'only_deletes',
        title: getDashboardKpiTitle(t, 'only_deletes'),
        icon: <Trash2 className="h-7 w-7" />,
        variant: 'violet',
        issueType: 'only_deletes',
        getValue: ({ counts }) => counts.only_deletes.pending,
      })
    }

    return cards
  }, [canViewDeleted, t])

  const [trendMode, setTrendMode] = useState<TrendMode>('pending')
  const trendKeys = TREND_DATA_KEYS[trendMode]
  const isErrorTypeIncluded = (code: number) => includedErrorTypes.includes(code)

  const trendData = useMemo(
    () =>
      summary.error_trend.map((point) => ({
        ...point,
        displayDate: point.date
          ? format(parseISO(point.date), 'MMM dd', { locale: dateFnsLocale })
          : '',
      })),
    [summary.error_trend, dateFnsLocale],
  )

  /**
   * Los tres tipos con su número REAL (by_type viene crudo) y su estado.
   * Alimenta la leyenda, que conserva los tres y tacha el excluido: una leyenda
   * automática no puede mostrar lo que no es slice.
   */
  const errorTypeSlices = useMemo(() => {
    const bt = counts.only_error.by_type
    return errorTypesWithState(includedErrorTypes).map((meta) => ({
      ...meta,
      label: t(meta.chartLabelKey),
      count: bt ? bt[meta.byTypeKey] : 0,
    }))
  }, [counts.only_error.by_type, includedErrorTypes, t])

  const issueDistribution = useMemo(() => {
    if (totalErrors === 0) return []
    return errorTypeSlices
      .filter((d) => d.included && d.count > 0)
      .map((d) => ({
        ...d,
        percentage: Math.round((d.count / totalErrors) * 100),
      }))
  }, [errorTypeSlices, totalErrors])

  const goToIssues = (issueType: IssueType) => {
    setSelectedType(issueType)
    router.push('/issues')
  }

  const scopeReady = filtersHydrated && selectedDealers.length > 0

  const reportPeriodLabel = useMemo(() => {
    if (!dateRange?.from) return null
    const toDate = dateRange.to ?? dateRange.from
    const currentYear = new Date().getFullYear()
    const omitYear =
      dateRange.from.getFullYear() === currentYear &&
      toDate.getFullYear() === currentYear
    const dateFmt = omitYear ? 'MMM d' : 'MMM d, yyyy'
    const from = format(dateRange.from, dateFmt, { locale: dateFnsLocale })
    const to = format(toDate, dateFmt, { locale: dateFnsLocale })
    return { from, to, sameDay: from === to }
  }, [dateRange, dateFnsLocale])

  return (
    <motion.div className="space-y-8" variants={container} initial="hidden" animate="show">
      <motion.div variants={item}>
        <PageHeading
          title={t('dashboard.title')}
          subtitle={t('dashboard.subtitle')}
          icon={<LayoutDashboard />}
          variant="default"
        />
      </motion.div>

      <motion.div variants={item}>
        <TodayStatusSection />
      </motion.div>

      <motion.div variants={item} className="space-y-6 border-t border-border pt-8">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {reportPeriodLabel
              ? reportPeriodLabel.sameDay
                ? t('dashboard.reportFrom', {
                    from: reportPeriodLabel.from,
                    to: reportPeriodLabel.from,
                  })
                : t('dashboard.reportFrom', {
                    from: reportPeriodLabel.from,
                    to: reportPeriodLabel.to,
                  })
              : '…'}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('dashboard.reportUsesFilters')}</p>
        </div>

      {!scopeReady ? (
        <p className="text-sm text-muted-foreground">{t('dashboard.selectDealersMetrics')}</p>
      ) : null}

      <div
        className={`grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${
          kpiCards.length >= 8 ? '2xl:grid-cols-4' : ''
        }`}
      >
        {/*
          Estas siguen siendo deep-links a Issues. El filtro por tipo de error
          vive en la fila de abajo, junto a los gráficos: acá no hay ninguna
          tarjeta de un tipo puntual, así que no se pisan.
        */}
        {kpiCards.map((card) => (
          <KPICard
            key={card.key}
            title={card.title}
            value={card.getValue({ totalPunches, errorRate, totalErrors, counts })}
            subtitle={card.subtitle?.({ totalPunches, totalErrors, counts })}
            icon={card.icon}
            variant={card.variant}
            loading={loading}
            onClick={card.issueType ? () => goToIssues(card.issueType!) : undefined}
          />
        ))}
      </div>

      {/*
        Filtro del Dashboard, no un deep-link: estas tres NO navegan a Issues.
        Clickearlas incluye/excluye el tipo y eso se refleja en las cards de
        arriba y en los dos gráficos de abajo. Acá están siempre activas —a
        diferencia de Punch Report, donde viven bajo `Only with errors`— porque
        los widgets de error del Dashboard son siempre sobre errores.
      */}
      <section className="@container/dash-error-types">
        <div className="mb-3 flex flex-wrap items-baseline gap-2">
          <h3 className="text-[13px] font-semibold text-foreground">
            {t('punch.errorTypesGroupTitle')}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {t('dashboard.errorTypesHint')}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 @[640px]/dash-error-types:grid-cols-3">
          {errorTypeSlices.map((meta) => (
            <KPICard
              key={`dash-error-type-${meta.code}`}
              title={t(meta.labelKey)}
              value={meta.count}
              icon={DASH_ERROR_TYPE_ICONS[meta.code]}
              variant={DASH_ERROR_TYPE_VARIANTS[meta.code]}
              loading={loading}
              filterCard
              compact
              onClick={() => toggleErrorType(meta.code)}
              active={meta.included}
              excluded={!meta.included}
              hintKey="dashboard.error-types"
              hint={
                meta.included
                  ? t('punch.errorTypeHintIncluded', { type: t(meta.labelKey) })
                  : t('punch.errorTypeHintExcluded', { type: t(meta.labelKey) })
              }
            />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-white to-primary/5">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <TrendingUp className="h-4 w-4 text-primary" />
                </div>
                {t('dashboard.errorTrend')}
              </CardTitle>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={trendMode}
                onValueChange={(value) => {
                  // Radix entrega '' al intentar destildar la opción activa:
                  // se ignora para que siempre haya una posición elegida.
                  if (value === 'pending' || value === 'all' || value === 'solved') {
                    setTrendMode(value)
                  }
                }}
              >
                <ToggleGroupItem value="pending" className="cursor-pointer px-3 text-xs">
                  {t('dashboard.errorTrendPending')}
                </ToggleGroupItem>
                <ToggleGroupItem value="all" className="cursor-pointer px-3 text-xs">
                  {t('dashboard.errorTrendAll')}
                </ToggleGroupItem>
                <ToggleGroupItem value="solved" className="cursor-pointer px-3 text-xs">
                  {t('dashboard.errorTrendSolved')}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                {t('common.loading')}
              </div>
            ) : trendData.length === 0 ? (
              <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                {t('common.noDataToDisplay')}
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
                    <Legend
                      content={<ErrorTypeLegend slices={errorTypeSlices} />}
                      wrapperStyle={{ fontSize: '11px' }}
                    />
                    {/*
                      Sólo se dibujan las series de los tipos incluidos; el color
                      y el gradiente salen del tipo, no del orden.
                    */}
                    {isErrorTypeIncluded(1) && (
                      <Area
                        type="monotone"
                        dataKey={trendKeys.clockOut}
                        name={t('dashboard.withoutClockOutChart')}
                        stroke="#ef4444"
                        strokeWidth={2}
                        fill="url(#colorClockOut)"
                      />
                    )}
                    {isErrorTypeIncluded(2) && (
                      <Area
                        type="monotone"
                        dataKey={trendKeys.breakMissing}
                        name={t('dashboard.breakMissingChart')}
                        stroke="#f59e0b"
                        strokeWidth={2}
                        fill="url(#colorBreak)"
                      />
                    )}
                    {isErrorTypeIncluded(3) && (
                      <Area
                        type="monotone"
                        dataKey={trendKeys.shift20h}
                        name={t('dashboard.shift20hChart')}
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        fill="url(#color20h)"
                      />
                    )}
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
              {t('dashboard.errorDistribution')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                {t('common.loading')}
              </div>
            ) : issueDistribution.length === 0 ? (
              <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                {t('common.noDataToDisplay')}
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
                      {/*
                        El color sale del TIPO, no de la posición: antes era
                        COLORS[index] sobre el array ya filtrado, así que al
                        excluir clock-out el break se volvía rojo.
                      */}
                      {issueDistribution.map((entry) => (
                        <Cell key={entry.code} fill={entry.color} />
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
                      content={<ErrorTypeLegend slices={errorTypeSlices} />}
                      wrapperStyle={{ fontSize: '11px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="overflow-hidden border-red-100 bg-gradient-to-br from-white to-red-50/50">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10">
                <TrendingDown className="h-4 w-4 text-destructive" />
              </div>
              {t('dashboard.dealersMostErrors')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            ) : topDealers.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('common.noDataToDisplay')}</p>
            ) : (
              <div className="space-y-4">
                {topDealers.map((dealerItem, index) => (
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
                      <span className="text-xs text-muted-foreground">{t('common.errors')}</span>
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
              {t('dashboard.yesterdayIssues')}
            </CardTitle>
            <Link
              href="/issues"
              className="flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80"
              onClick={() => setSelectedType('only_error')}
            >
              {t('common.viewAll')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent className="min-w-0">
            <DashboardYesterdayIssuesTable />
          </CardContent>
        </Card>
      </div>
      </motion.div>
    </motion.div>
  )
}
