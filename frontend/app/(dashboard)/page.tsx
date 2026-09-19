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
  Hash,
  Info,
  LayoutDashboard,
  Percent,
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
import { ErrorStatusBar } from '@/components/filters/error-status-bar'
import { TodayStatusSection } from '@/components/dashboard/today-status-section'
import { DealersRankingDialog } from '@/components/dashboard/dealers-ranking-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DashboardYesterdayIssuesTable } from '@/components/dashboard/dashboard-yesterday-issues-table'
import { useFilters } from '@/lib/filter-context'
import { countingFlagTypes, errorTypesWithState, FLAG_TYPE_META, trendSeriesKeys, visibleFlagTypes } from '@/lib/ttk/error-type-meta'
import { FlagTypeBreakdown, FlagTypeCards } from '@/components/ttk/flag-type-cards'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useTtkDashboardSummary } from '@/hooks/use-ttk-dashboard-summary'
import { useTtkDealerRanking } from '@/hooks/use-ttk-dealer-ranking'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { canAccessDailyPunch, canDeletePunch, canViewFakeGps, canViewPaymentType } from '@/lib/auth/ttk-permissions'
import { useTranslation } from '@/lib/i18n/locale-context'
import { rangeStartsBeforeCorrectionsLog, type ErrorStatus } from '@/lib/ttk/error-status'
import { EMPTY_DEALER_RANKING_ROWS } from '@/lib/ttk/dealer-ranking-types'
import { TODAY_LIVE_STATUS_ALL } from '@/lib/ttk/today-live-status'

const TREND_TOTAL_KEYS = {
  all: 'total_errors_all',
  pending: 'total_errors',
  fixed: 'total_errors_fixed',
} as const

type ErrorTypeLegendSlice = {
  code: number
  label: string
  color: string
  included: boolean
  /** Punto hueco, para la mitad pendiente del apilado: en el gráfico va punteada. */
  dashed?: boolean
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
            style={
              s.dashed
                ? { border: `1.5px dashed ${s.color}`, opacity: s.included ? 1 : 0.3 }
                : { backgroundColor: s.color, opacity: s.included ? 1 : 0.3 }
            }
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

type IssueType = 'all' | 'only_flagged'

interface DashboardKpiConfig {
  key: 'total_punches' | 'fused_errors' | 'error_rate'
  title: string
  icon: React.ReactNode
  variant: KPICardVariant
  issueType: IssueType
  errorStatus?: ErrorStatus
  getValue: (args: {
    totalPunches: number
    errorRate: number
    fusedTotal: number
    counts: ReturnType<typeof useTtkDashboardSummary>['summary']['counts']
  }) => string | number
  subtitle?: (args: {
    totalPunches: number
    fusedTotal: number
    counts: ReturnType<typeof useTtkDashboardSummary>['summary']['counts']
  }) => React.ReactNode
}

/**
 * Tooltip del trend, con el desglose por tipo.
 *
 * Responde el caso de uso que perdió el selector de tres posiciones: "de los sin
 * clock out, cuántos se corrigieron". Lee `payload[0].payload` —el punto crudo—
 * porque recharts sólo pasa en `payload` los `dataKey` que efectivamente dibuja, y
 * las series de pendientes y corregidos no se dibujan.
 */
function ErrorTrendTooltip({
  active,
  payload,
  label,
  includedTypes,
  t,
}: {
  active?: boolean
  payload?: { payload?: Record<string, unknown> }[]
  label?: string
  includedTypes: readonly number[]
  t: (key: string, vars?: Record<string, string | number>) => string
}) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null

  const rows = FLAG_TYPE_META.filter(
    (meta) => meta.countsInErrorsRateTrendDonut && includedTypes.includes(meta.code),
  ).map((meta) => {
    const keys = trendSeriesKeys(meta)
    return {
      code: meta.code,
      label: t(meta.chartLabelKey),
      color: meta.color,
      total: Number(point[keys.all] ?? 0),
      pending: Number(point[keys.pending] ?? 0),
      corrected: Number(point[keys.fixed] ?? 0),
    }
  })

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-[0_10px_40px_-10px_rgb(0_0_0/0.15)]">
      <p className="mb-1.5 font-medium text-slate-900">{label}</p>
      <div className="flex flex-col gap-1">
        {rows.map((row) => (
          <div key={row.code} className="flex items-baseline gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: row.color }}
            />
            <span className="text-slate-600">{row.label}:</span>
            <span className="text-slate-900">
              {t('dashboard.errorTrendTooltipBreakdown', {
                total: row.total,
                pending: row.pending,
                corrected: row.corrected,
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
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
    setSelectedDealers,
    dateRange,
    filtersHydrated,
    setSelectedType,
    errorStatus,
    setErrorStatus,
    setSelectedTodayLiveStatus,
    includedErrorTypes,
    toggleErrorType,
    errorTypesReady,
  } = useFilters()
  const { user, hasPermission } = useSrsMe()
  const canViewDeleted = canDeletePunch(hasPermission, user?.isSystemAdmin)
  const canViewPayment = canViewPaymentType(hasPermission, user?.isSystemAdmin)
  const canViewFakeGpsCard = canViewFakeGps(hasPermission, user?.isSystemAdmin)
  const visibleTypes = useMemo(
    () =>
      visibleFlagTypes({
        canViewPaymentType: canViewPayment,
        canViewDeleted,
        canViewFakeGps: canViewFakeGpsCard,
      }),
    [canViewPayment, canViewDeleted, canViewFakeGpsCard],
  )
  const canAccessPunchReport = canAccessDailyPunch(hasPermission, user?.isSystemAdmin)
  const [rankingOpen, setRankingOpen] = useState(false)

  const { summary, loading } = useTtkDashboardSummary({
    includedErrorTypes,
    errorTypesReady,
    search,
    selectedDealers,
    dateRange,
    filtersHydrated,
  })
  const {
    ranking,
    params: rankingParams,
    loading: rankingLoading,
  } = useTtkDealerRanking({
    includedErrorTypes,
    errorTypesReady,
    search,
    selectedDealers,
    dateRange,
    filtersHydrated,
  })

  const { counts } = summary
  const totalPunches = counts.total_punches ?? 0
  const noErrorTypes = includedErrorTypes.length === 0
  const isCorrected = errorStatus === 'corrected'
  const fusedTotal = noErrorTypes
    ? 0
    : isCorrected
      ? counts.only_fixed.pending
      : counts.only_error.pending
  const errorRate =
    !noErrorTypes && totalPunches > 0
      ? Math.round((fusedTotal / totalPunches) * 1000) / 10
      : 0
  const countingMetas = countingFlagTypes(isCorrected ? 'corrected' : 'pending')
  const rankingRows = noErrorTypes
    ? EMPTY_DEALER_RANKING_ROWS
    : isCorrected
      ? ranking.corrected
      : ranking.pending
  const topDealers = rankingRows.slice(0, 5)

  const kpiCards: DashboardKpiConfig[] = useMemo(() => {
    const fusedBucket = isCorrected ? counts.only_fixed : counts.only_error
    return [
      {
        key: 'total_punches',
        title: t('punch.total'),
        icon: <Hash className="h-7 w-7" />,
        variant: 'default',
        issueType: 'all',
        getValue: ({ totalPunches }) => totalPunches,
        subtitle: ({ counts }) => t('punch.withErrorsInPeriod', { count: counts.only_error.pending }),
      },
      {
        key: 'fused_errors',
        title: isCorrected ? t('punch.correctedKpi') : t('punch.errors'),
        icon: isCorrected ? <CheckCheck className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />,
        variant: isCorrected ? 'info' : 'warning',
        issueType: 'only_flagged',
        errorStatus,
        getValue: ({ fusedTotal }) => fusedTotal,
        subtitle: () => (
          <div className="space-y-1">
            <FlagTypeBreakdown metas={countingMetas} byType={fusedBucket.by_type} />
            <p className="text-[10px] text-muted-foreground">{t('punch.breakdownNote')}</p>
          </div>
        ),
      },
      {
        key: 'error_rate',
        title: t('punch.errorRate'),
        icon: <Percent className="h-7 w-7" />,
        variant: 'danger',
        issueType: 'only_flagged',
        errorStatus,
        getValue: ({ errorRate }) => `${errorRate}%`,
        subtitle: ({ totalPunches }) => (
          <div className="space-y-1">
            <FlagTypeBreakdown
              metas={countingMetas}
              byType={fusedBucket.by_type}
              totalPunches={totalPunches}
              asRate
            />
            <p className="text-[10px] text-muted-foreground">{t('punch.errorsOverActive')}</p>
          </div>
        ),
      },
    ]
  }, [countingMetas, counts.only_error, counts.only_fixed, errorStatus, isCorrected, t])

  const countingIncluded = countingMetas.filter((meta) => includedErrorTypes.includes(meta.code))
  const soloMeta = countingIncluded.length === 1 ? countingIncluded[0] : null

  const trendAreas = isCorrected && !soloMeta
    ? [
        <Area
          key="total-fixed"
          type="monotone"
          stackId="trend"
          dataKey={TREND_TOTAL_KEYS.fixed}
          name={t('punch.errorStatusCorrected')}
          stroke="#10b981"
          strokeWidth={2}
          fill="url(#colorTotalFixed)"
        />,
        <Area
          key="total-pending"
          type="monotone"
          stackId="trend"
          dataKey={TREND_TOTAL_KEYS.pending}
          name={t('punch.errorStatusPending')}
          stroke="#94a3b8"
          strokeDasharray="4 3"
          strokeWidth={2}
          fill="url(#colorTotalPending)"
        />,
      ]
    : soloMeta
    ? [
        <Area
          key="fixed"
          type="monotone"
          stackId="trend"
          dataKey={trendSeriesKeys(soloMeta).fixed}
          name={t('punch.errorStatusCorrected')}
          stroke={soloMeta.color}
          strokeWidth={2}
          fill={`url(#colorType${soloMeta.code})`}
        />,
        <Area
          key="pending"
          type="monotone"
          stackId="trend"
          dataKey={trendSeriesKeys(soloMeta).pending}
          name={t('punch.errorStatusPending')}
          stroke={soloMeta.color}
          strokeDasharray="4 3"
          strokeWidth={2}
          fill={`url(#colorType${soloMeta.code}Light)`}
        />,
      ]
    : countingIncluded.map((meta) => (
        <Area
          key={meta.code}
          type="monotone"
          dataKey={trendSeriesKeys(meta).all}
          name={t(meta.chartLabelKey)}
          stroke={meta.color}
          strokeWidth={2}
          fill={`url(#colorType${meta.code})`}
        />
      ))

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

  const errorTypeSlices = useMemo(() => {
    const bt = isCorrected ? counts.only_fixed.by_type : counts.only_error.by_type
    return errorTypesWithState(includedErrorTypes, countingMetas).map((meta) => ({
      ...meta,
      label: t(meta.chartLabelKey),
      count: bt ? (bt[meta.byTypeKey as keyof typeof bt] ?? 0) : 0,
    }))
  }, [counts.only_error.by_type, counts.only_fixed.by_type, isCorrected, includedErrorTypes, countingMetas, t])

  /**
   * Techo del eje Y, común a los dos estados: el día con más errores del período,
   * contando pendientes y corregidos. Es el máximo que puede alcanzar cualquiera
   * de las dos vistas, así que ninguna queda cortada y las dos se leen a la misma
   * escala.
   */
  const trendYMax = useMemo(
    () => summary.error_trend.reduce((max, p) => Math.max(max, p.total_errors_all ?? 0), 0),
    [summary.error_trend],
  )

  const trendStacked = isCorrected || soloMeta !== null

  const trendLegendSlices: ErrorTypeLegendSlice[] = trendStacked
    ? [
        {
          code: -1,
          label: t('punch.errorStatusCorrected'),
          color: soloMeta ? soloMeta.color : '#10b981',
          included: true,
        },
        {
          code: -2,
          label: t('punch.errorStatusPending'),
          color: soloMeta ? soloMeta.color : '#94a3b8',
          included: true,
          dashed: true,
        },
      ]
    : errorTypeSlices

  const donutTotal = fusedTotal
  const issueDistribution = useMemo(() => {
    if (donutTotal === 0) return []
    return errorTypeSlices
      .filter((d) => d.included && d.count > 0)
      .map((d) => ({
        ...d,
        percentage: Math.round((d.count / donutTotal) * 100),
      }))
  }, [errorTypeSlices, donutTotal])

  /**
   * Cada deep-link fija LOS DOS ejes, explícito y nunca por omisión.
   *
   * `errorStatus` es global y sobrevive a la navegación: sin fijarlo, un acceso
   * pensado para ver el estado actual abriría historial corregido (con *Only with
   * errors* marcada, `corrected` se convierte en `only_fixed`).
   */
  const goToIssues = (issueType: IssueType, status: ErrorStatus = 'pending') => {
    setSelectedType(issueType)
    setErrorStatus(status)
    router.push('/issues')
  }

  /**
   * Click en un dealer del modal (F3): Punch Report agrupado, con los filtros del
   * Dashboard y sólo ese dealer.
   *
   * - El header queda en ese dealer y persiste en la cookie de siempre (U6).
   * - *Only with errors* habilita el switch y los tipos en Punch Report (F6), y el
   *   switch va explícito en la posición del Dashboard (U11).
   * - El estado en vivo se limpia: el ranking no lo aplica y Grouped sí, así que
   *   uno que quedó puesto haría que el destino no cierre contra el modal.
   */
  const openDealerInPunchReport = (idDealer: number) => {
    setSelectedDealers([String(idDealer)])
    setSelectedType('only_flagged')
    setErrorStatus(errorStatus)
    setSelectedTodayLiveStatus(TODAY_LIVE_STATUS_ALL)
    setRankingOpen(false)
    router.push('/issues?view=grouped')
  }

  const scopeReady = filtersHydrated && selectedDealers.length > 0
  const showCorrectionsCoverageNotice = rangeStartsBeforeCorrectionsLog(dateRange?.from)

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

  /** `Report from … to …`: el título del período y el subtítulo del modal de dealers. */
  const reportPeriodText = reportPeriodLabel
    ? t('dashboard.reportFrom', {
        from: reportPeriodLabel.from,
        to: reportPeriodLabel.sameDay ? reportPeriodLabel.from : reportPeriodLabel.to,
      })
    : null

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
          <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            {reportPeriodText ?? '…'}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('dashboard.reportUsesFilters')}</p>
        </div>

        {/*
          El registro de correcciones arrancó vacío el 27/08/2026 y no hubo backfill.
          No promete un cero: `punch_date` es la fecha del PONCHE, así que una
          corrección posterior puede caer en un rango anterior. Lo que se avisa es
          cobertura parcial.
        */}
        {showCorrectionsCoverageNotice ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>{t('punch.correctionsCoverageNotice')}</AlertDescription>
          </Alert>
        ) : null}

      {!scopeReady ? (
        <p className="text-sm text-muted-foreground">{t('dashboard.selectDealersMetrics')}</p>
      ) : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {kpiCards.map((card) => (
          <KPICard
            key={card.key}
            title={card.title}
            value={card.getValue({ totalPunches, errorRate, fusedTotal, counts })}
            subtitle={card.subtitle?.({ totalPunches, fusedTotal, counts })}
            icon={card.icon}
            variant={card.variant}
            loading={loading}
            inline
            onClick={() => goToIssues(card.issueType, card.errorStatus ?? errorStatus)}
          />
        ))}
      </div>

      <section className="@container/flag-types">
        <ErrorStatusBar
          title={t('punch.errorTypesGroupTitle')}
          hint={t('dashboard.errorTypesHint')}
          pendingTotal={noErrorTypes ? 0 : counts.only_error.pending}
          correctedTotal={noErrorTypes ? 0 : counts.only_fixed.pending}
          loading={loading}
        />
        <FlagTypeCards
          status={errorStatus}
          visibleMetas={visibleTypes}
          byType={isCorrected ? counts.only_fixed.by_type : counts.only_error.by_type}
          fakeGpsWithData={counts.fake_gps.with_data}
          includedErrorTypes={includedErrorTypes}
          typesActive
          onToggle={toggleErrorType}
          loading={loading}
          compact
          showStatusSuffix
        />
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
            </div>
            {/*
              El techo de la curva es el mismo en los dos estados, así que sin
              esta línea el gráfico parecía no enterarse del switch. Lo que cambia
              es qué se rellena abajo, y en corregidos hay que decir además que el
              eje es el día de la ponchada, no el día en que se corrigió.
            */}
            <p className="text-[11px] leading-snug text-muted-foreground">
              {isCorrected
                ? t('dashboard.errorTrendNoteCorrected')
                : t('dashboard.errorTrendNotePending')}
            </p>
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
                      {FLAG_TYPE_META.filter((meta) => meta.countsInErrorsRateTrendDonut).map(
                        (meta) => (
                          <g key={meta.code}>
                            <linearGradient id={`colorType${meta.code}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={meta.color} stopOpacity={0.3} />
                              <stop offset="95%" stopColor={meta.color} stopOpacity={0} />
                            </linearGradient>
                            <linearGradient
                              id={`colorType${meta.code}Light`}
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop offset="5%" stopColor={meta.color} stopOpacity={0.12} />
                              <stop offset="95%" stopColor={meta.color} stopOpacity={0} />
                            </linearGradient>
                          </g>
                        ),
                      )}
                      <linearGradient id="colorTotalFixed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="colorTotalPending" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
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
                    {/*
                      Techo fijo, el mismo en los dos estados. Sin esto el eje se
                      reescala al mover el switch —en Pending el máximo es el tipo
                      más alto, en Corrected es la SUMA de los tipos, porque el
                      apilado agrega— y las dos vistas dejaban de ser comparables:
                      la misma curva parecía el doble de alta.
                    */}
                    <YAxis
                      stroke="#64748b"
                      fontSize={12}
                      axisLine={false}
                      tickLine={false}
                      domain={trendYMax > 0 ? [0, trendYMax] : undefined}
                      allowDecimals={false}
                    />
                    {/*
                      Content propio: lee `payload[0].payload`, porque recharts sólo
                      pasa los dataKey DIBUJADOS y el desglose no es uno de ellos.
                    */}
                    <Tooltip
                      content={<ErrorTrendTooltip includedTypes={includedErrorTypes} t={t} />}
                    />
                    <Legend
                      content={<ErrorTypeLegend slices={trendLegendSlices} />}
                      wrapperStyle={{ fontSize: '11px' }}
                    />
                    {/*
                      Con UN solo tipo incluido el área se abre en dos: corregidos
                      abajo sólido, pendientes arriba más claro, y el techo sigue
                      siendo el total. Con 2 o 3 tipos son líneas de total, porque
                      seis series apiladas no se leen.

                      Va como array, armado arriba. Un fragmento acá deja el
                      gráfico sin series y sin eje Y — ver el comentario de
                      `trendAreas`.
                    */}
                    {trendAreas}
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
        {/*
          Los dos rankings son widgets distintos con el mismo lugar: deuda
          (errores vigentes) en pendientes, actividad (correcciones del ledger) en
          corregidos. Cambia el título y el acento, porque un número verde bajo un
          marco rojo se lee como problema.
        */}
        <Card
          className={
            isCorrected
              ? 'overflow-hidden border-emerald-100 bg-gradient-to-br from-white to-emerald-50/50'
              : 'overflow-hidden border-red-100 bg-gradient-to-br from-white to-red-50/50'
          }
        >
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                  isCorrected ? 'bg-emerald-500/10' : 'bg-destructive/10'
                }`}
              >
                {isCorrected ? (
                  <CheckCheck className="h-4 w-4 text-emerald-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-destructive" />
                )}
              </div>
              {isCorrected
                ? t('dashboard.dealersMostCorrected')
                : t('dashboard.dealersMostErrors')}
            </CardTitle>
            {/*
              Mismo lugar que el "View all" de *Yesterday's punch issues*, pero botón y
              no link: abre el modal con el ranking entero, no navega.
            */}
            {rankingRows.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 text-sm font-medium text-primary hover:text-primary/80"
                onClick={() => setRankingOpen(true)}
              >
                {t('common.viewAll')}
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            {rankingLoading ? (
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            ) : topDealers.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('common.noDataToDisplay')}</p>
            ) : (
              <div className="space-y-4">
                {topDealers.map((dealerItem, index) => (
                  <motion.div
                    key={dealerItem.idDealer}
                    className="flex items-center justify-between rounded-xl bg-muted/30 p-3 transition-colors hover:bg-muted/50"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold ${
                          index > 1
                            ? 'bg-muted text-muted-foreground'
                            : isCorrected
                              ? index === 0
                                ? 'bg-emerald-500/20 text-emerald-700'
                                : 'bg-emerald-500/10 text-emerald-600'
                              : index === 0
                                ? 'bg-destructive/20 text-destructive'
                                : 'bg-warning/20 text-warning'
                        }`}
                      >
                        #{index + 1}
                      </span>
                      <p className="text-sm font-medium text-foreground">{dealerItem.dealerName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-2xl font-bold tabular-nums ${
                          isCorrected ? 'text-emerald-600' : 'text-destructive'
                        }`}
                      >
                        {dealerItem.total}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {isCorrected ? t('common.corrections') : t('common.errors')}
                      </span>
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
              {/*
                Tampoco sigue el switch: es "lo que quedó sin resolver ayer", y en
                corregidos no significaría nada.
              */}
              {errorStatus === 'corrected' ? (
                <span className="text-xs font-normal text-muted-foreground">
                  {t('punch.pendingOnlySuffix')}
                </span>
              ) : null}
            </CardTitle>
            <Link
              href="/issues"
              className="flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80"
              // "Lo que quedó sin resolver ayer": el deep-link fija los dos ejes.
              onClick={() => {
                setSelectedType('only_flagged')
                setErrorStatus('pending')
              }}
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

      <DealersRankingDialog
        open={rankingOpen}
        onOpenChange={setRankingOpen}
        isCorrected={isCorrected}
        rows={rankingRows}
        loading={rankingLoading}
        includedErrorTypes={includedErrorTypes}
        periodLabel={reportPeriodText}
        showCoverageNotice={isCorrected && showCorrectionsCoverageNotice}
        canAccessPunchReport={canAccessPunchReport}
        onDealerClick={openDealerInPunchReport}
        exportParams={rankingParams}
      />
      </motion.div>
    </motion.div>
  )
}
