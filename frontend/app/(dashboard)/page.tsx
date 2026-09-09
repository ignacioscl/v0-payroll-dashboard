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
  Info,
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
import { ErrorStatusToggle } from '@/components/filters/error-status-toggle'
import { TodayStatusSection } from '@/components/dashboard/today-status-section'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DashboardYesterdayIssuesTable } from '@/components/dashboard/dashboard-yesterday-issues-table'
import { useFilters } from '@/lib/filter-context'
import { errorTypeMeta, errorTypesWithState } from '@/lib/ttk/error-type-meta'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useTtkDashboardSummary } from '@/hooks/use-ttk-dashboard-summary'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { canDeletePunch } from '@/lib/auth/ttk-permissions'
import { useTranslation } from '@/lib/i18n/locale-context'
import { getDashboardKpiTitle } from '@/lib/i18n/label-helpers'
import { rangeStartsBeforeCorrectionsLog, type ErrorStatus } from '@/lib/ttk/error-status'

/**
 * Claves que dibuja cada posición del toggle. Fuera del componente para que la
 * referencia sea estable entre renders: el toggle sólo intercambia dataKeys, no
 * vuelve a pedir datos.
 */
/**
 * El trend muestra SIEMPRE el total (pendientes + corregidos). El selector de tres
 * posiciones se eliminó: el eje de estado es ahora el switch del header y gobierna
 * cards y grillas, no la serie del gráfico.
 *
 * Las tres claves `_all` son las únicas que quedan dibujadas; las otras dos
 * familias siguen viajando en la respuesta y alimentan el desglose del tooltip.
 */
const TREND_DATA_KEYS = {
  clockOut: 'clock_out_missing_all',
  breakMissing: 'break_missing_all',
  shift20h: 'shift_20h_plus_all',
} as const

/** Las tres series del trend cuando hay más de un tipo incluido: total por tipo. */
const TREND_SERIES = [
  {
    code: 1,
    key: 'clockOut',
    labelKey: 'dashboard.withoutClockOutChart',
    stroke: '#ef4444',
    gradient: 'colorClockOut',
  },
  {
    code: 2,
    key: 'breakMissing',
    labelKey: 'dashboard.breakMissingChart',
    stroke: '#f59e0b',
    gradient: 'colorBreak',
  },
  {
    code: 3,
    key: 'shift20h',
    labelKey: 'dashboard.shift20hChart',
    stroke: '#8b5cf6',
    gradient: 'color20h',
  },
] as const

/** Gradientes del apilado de un solo tipo: sólido para corregidos, claro para pendientes. */
const TREND_SOLO_GRADIENTS = {
  1: { solid: 'colorClockOut', light: 'colorClockOutLight' },
  2: { solid: 'colorBreak', light: 'colorBreakLight' },
  3: { solid: 'color20h', light: 'color20hLight' },
} as const

/**
 * Agregado de los tipos incluidos. El backend arma las tres con la misma lista
 * blanca que las series por tipo, así que el apilado cierra con lo que se ve.
 */
const TREND_TOTAL_KEYS = {
  all: 'total_errors_all',
  pending: 'total_errors',
  fixed: 'total_errors_fixed',
} as const

/** Por tipo: la clave del total, la de pendientes y la de corregidos. */
const TREND_BREAKDOWN_KEYS = {
  1: {
    all: 'clock_out_missing_all',
    pending: 'clock_out_missing',
    fixed: 'clock_out_missing_fixed',
  },
  2: { all: 'break_missing_all', pending: 'break_missing', fixed: 'break_missing_fixed' },
  3: { all: 'shift_20h_plus_all', pending: 'shift_20h_plus', fixed: 'shift_20h_plus_fixed' },
} as const

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
  /** Posición del switch que deja el deep-link. Default `pending`. */
  errorStatus?: ErrorStatus
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

  const rows = ([1, 2, 3] as const)
    .filter((code) => includedTypes.includes(code))
    .map((code) => {
      const keys = TREND_BREAKDOWN_KEYS[code]
      return {
        code,
        label: t(errorTypeMeta(code).chartLabelKey),
        color: errorTypeMeta(code).color,
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
    dateRange,
    filtersHydrated,
    setSelectedType,
    errorStatus,
    setErrorStatus,
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
  const isCorrected = errorStatus === 'corrected'
  /**
   * El ranking SÍ sigue al switch, y en corregidos sale del ledger. Leer el estado
   * actual dejaría en cero a la sucursal que corrigió todo —la haría pasar por la
   * más prolija cuando es la que más trabajo hizo—; el mismo criterio que el top
   * de empleados. `?? EMPTY` porque una respuesta cacheada de antes de este cambio
   * no trae la clave nueva.
   */
  const topDealers = noErrorTypes
    ? EMPTY_TOP_DEALERS
    : (isCorrected ? summary.top_dealers_fixed : summary.top_dealers) ?? EMPTY_TOP_DEALERS

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
        // El eje de estado salió del radio: se abre Punch Report en el tipo de
        // error con el switch en Corrected, no en un `only_fixed` que ya no existe
        // como posición del radio.
        issueType: 'only_error',
        errorStatus: 'corrected',
        // Cuenta EVENTOS de corrección: una ponchada con dos correcciones suma dos.
        getValue: ({ counts }) => counts.only_fixed.pending,
        subtitle: ({ counts }) => {
          const bt = counts.only_fixed.by_type
          const onDeleted = counts.only_fixed.on_deleted ?? 0
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
              {onDeleted > 0 ? (
                <span>{t('punch.correctedOnDeletedPunches', { count: onDeleted })}</span>
              ) : null}
            </div>
          )
        },
      },
    ]

    if (canViewDeleted) {
      cards.push({
        key: 'only_deletes',
        title: getDashboardKpiTitle(t, 'only_deletes'),
        icon: <Trash2 className="h-7 w-7" />,
        variant: 'violet',
        issueType: 'only_deletes',
        // El número grande son TODAS las eliminadas del período, con o sin error:
        // no lo mueve la lista de tipos ni el switch de estado (decisión D-A). Es
        // lo que esta tarjeta ya cuenta hoy, así que no cambia de significado.
        getValue: ({ counts }) => counts.only_deletes.pending,
        subtitle: ({ counts }) => {
          const bt = counts.only_deletes.by_type
          if (!bt) return null
          const withError = bt.clock_out_missing + bt.break_missing + bt.shift_20h_plus
          // Desglose por tipo, como el resto de las tarjetas (MEJORA-02). El
          // backend ya lo devuelve; sólo se mostraba el total. La suma puede ser
          // MENOR que el número grande —hay eliminadas sin error—, y se dice.
          return (
            <div className="flex flex-col gap-0.5 text-[11px]">
              <div className="flex flex-wrap gap-x-2 gap-y-0.5">
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
              <span className="text-muted-foreground">
                {t('punch.deletedWithError', { count: withError })}
              </span>
            </div>
          )
        },
      })
    }

    return cards
  }, [canViewDeleted, t])

  const trendKeys = TREND_DATA_KEYS
  /** El único tipo incluido, o null si hay dos o tres. Gobierna el apilado. */
  const soloType =
    includedErrorTypes.length === 1 ? (includedErrorTypes[0] as 1 | 2 | 3) : null
  const isErrorTypeIncluded = (code: number) => includedErrorTypes.includes(code)

  /**
   * Las series del trend, como ARRAY — nunca envueltas en un fragmento.
   *
   * recharts no encuentra los `<Area>` que están dentro de un `<>...</>`: los
   * ignora como si no existieran. El gráfico queda con la grilla y el eje X
   * dibujados, sin eje Y y sin una sola área — que es exactamente lo que se veía.
   * Verificado con recharts 2.15 renderizando el mismo chart de las dos formas:
   * hijos directos ⇒ 3 áreas y eje Y; el mismo contenido dentro de un fragmento
   * ⇒ 0 áreas y sin eje Y. Un array sí lo aplana, por eso van así.
   */
  const trendAreas = isCorrected && !soloType
    ? // Corrected con dos o tres tipos: el techo sigue siendo el total del día, y
      // abajo se rellena la parte corregida. Va agregado y no por tipo porque tres
      // tipos × dos mitades son seis áreas apiladas, que no se leen.
      [
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
    : soloType
    ? [
        <Area
          key="fixed"
          type="monotone"
          stackId="trend"
          dataKey={TREND_BREAKDOWN_KEYS[soloType].fixed}
          name={t('punch.errorStatusCorrected')}
          stroke={errorTypeMeta(soloType).color}
          strokeWidth={2}
          fill={`url(#${TREND_SOLO_GRADIENTS[soloType].solid})`}
        />,
        <Area
          key="pending"
          type="monotone"
          stackId="trend"
          dataKey={TREND_BREAKDOWN_KEYS[soloType].pending}
          name={t('punch.errorStatusPending')}
          stroke={errorTypeMeta(soloType).color}
          strokeDasharray="4 3"
          strokeWidth={2}
          fill={`url(#${TREND_SOLO_GRADIENTS[soloType].light})`}
        />,
      ]
    : TREND_SERIES.filter((serie) => isErrorTypeIncluded(serie.code)).map((serie) => (
        <Area
          key={serie.code}
          type="monotone"
          dataKey={trendKeys[serie.key]}
          name={t(serie.labelKey)}
          stroke={serie.stroke}
          strokeWidth={2}
          fill={`url(#${serie.gradient})`}
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

  /**
   * Los tres tipos con su número REAL (by_type viene crudo) y su estado.
   * Alimenta la leyenda, que conserva los tres y tacha el excluido: una leyenda
   * automática no puede mostrar lo que no es slice.
   */
  /**
   * El bucket depende del estado: en corregidos son los tipos que se ARREGLARON,
   * no los que la ponchada tiene hoy. Leer siempre `only_error.by_type` hacía que
   * estas tarjetas —y el donut, que se alimenta de acá— mostraran pendientes con
   * el switch en corregidos.
   */
  const errorTypeSlices = useMemo(() => {
    const bt = isCorrected ? counts.only_fixed.by_type : counts.only_error.by_type
    return errorTypesWithState(includedErrorTypes).map((meta) => ({
      ...meta,
      label: t(meta.chartLabelKey),
      count: bt ? bt[meta.byTypeKey] : 0,
    }))
  }, [counts.only_error.by_type, counts.only_fixed.by_type, isCorrected, includedErrorTypes, t])

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

  /** Apilado = las áreas son Corregidos/Pendientes, no los tres tipos. */
  const trendStacked = isCorrected || soloType !== null

  /**
   * La leyenda tiene que nombrar lo que está dibujado. Con el gráfico apilado,
   * la leyenda de tipos ponía tres nombres que no eran ninguna de las dos áreas.
   */
  const trendLegendSlices: ErrorTypeLegendSlice[] = trendStacked
    ? [
        {
          code: -1,
          label: t('punch.errorStatusCorrected'),
          color: soloType ? errorTypeMeta(soloType).color : '#10b981',
          included: true,
        },
        {
          code: -2,
          label: t('punch.errorStatusPending'),
          color: soloType ? errorTypeMeta(soloType).color : '#94a3b8',
          included: true,
          dashed: true,
        },
      ]
    : errorTypeSlices

  /**
   * El denominador tiene que ser del MISMO estado que las porciones, si no los
   * porcentajes no cierran: `totalErrors` es siempre el de pendientes y alimenta
   * además el card With errors y el error rate, que no siguen al switch.
   */
  const donutTotal = isCorrected ? (noErrorTypes ? 0 : counts.only_fixed.pending) : totalErrors
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
   * pensado para ver el estado actual abriría historial corregido (y con la tabla
   * de verdad, `all` + `corrected` se convierte en `only_fixed`).
   */
  const goToIssues = (issueType: IssueType, status: ErrorStatus = 'pending') => {
    setSelectedType(issueType)
    setErrorStatus(status)
    router.push('/issues')
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
            onClick={
              card.issueType
                ? () => goToIssues(card.issueType!, card.errorStatus ?? 'pending')
                : undefined
            }
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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="text-[13px] font-semibold text-foreground">
              {t('punch.errorTypesGroupTitle')}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {t('dashboard.errorTypesHint')}
            </p>
          </div>
          {/* El eje pendiente/corregido vive junto a lo que gobierna, no en el
              header: allá competía por lugar con dealers, rango y el botón de
              agregar hasta desbordarse encima de ellos. En el Dashboard no hay
              radio de tipos, así que siempre aplica. */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t('punch.errorStatus')}
            </span>
            <ErrorStatusToggle />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 @[640px]/dash-error-types:grid-cols-3">
          {errorTypeSlices.map((meta) => (
            <KPICard
              key={`dash-error-type-${meta.code}`}
              // El sufijo dice de qué estado es el número: sin él, "Break missing: 1"
              // no distingue un break pendiente de uno corregido.
              title={`${t(meta.labelKey)} · ${
                isCorrected ? t('punch.errorStatusCorrected') : t('punch.errorStatusPending')
              }`}
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
                      {/* Banda clara: la mitad "pendiente" del apilado de un solo tipo. */}
                      <linearGradient id="colorClockOutLight" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.12} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorBreakLight" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.12} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="color20hLight" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.12} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                      {/* Apilado agregado de Corrected: corregidos abajo, pendientes arriba. */}
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
          <CardHeader className="pb-4">
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
                      <p className="text-sm font-medium text-foreground">{dealerItem.dealer_name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-2xl font-bold tabular-nums ${
                          isCorrected ? 'text-emerald-600' : 'text-destructive'
                        }`}
                      >
                        {dealerItem.error_count}
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
                setSelectedType('only_error')
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
      </motion.div>
    </motion.div>
  )
}
