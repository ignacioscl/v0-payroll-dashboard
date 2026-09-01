'use client'

import { useEffect, useMemo, useState } from 'react'
import { useFilters } from '@/lib/filter-context'
import { useTtkIssueCounts } from '@/hooks/use-ttk-issue-counts'
import { IssuesDataTable } from '@/components/ttk/issues-data-table'
import { GroupedIssuesDataTable } from '@/components/ttk/grouped-issues-table'
import { PunchReportFilterPanel } from '@/components/ttk/punch-report-filter-panel'
import { KPICard, type KPICardVariant } from '@/components/dashboard/kpi-card'
import { PageHeading } from '@/components/layout/page-heading'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { canDeletePunch, canViewPaymentType } from '@/lib/auth/ttk-permissions'
import { usePaymentTypesCatalog } from '@/hooks/use-payment-types-catalog'
import {
  PAYMENT_TYPE_FILTER_ALL,
  PAYMENT_TYPE_FILTER_WITHOUT,
  type PaymentTypeFilterValue,
} from '@/lib/ttk/payment-type-filter'
import { TODAY_LIVE_STATUS_ALL } from '@/lib/ttk/today-live-status'
import {
  AlertTriangle,
  LogOut,
  Hand,
  Trash2,
  DollarSign,
  CheckCheck,
  Coffee,
  Timer,
  LayoutList,
  Users,
} from 'lucide-react'
import { ERROR_TYPE_META } from '@/lib/ttk/error-type-meta'
import { ALL_ERROR_TYPES } from '@/lib/filters/error-types-cookie'
import { useTranslation } from '@/lib/i18n/locale-context'
import { getIssueFilterLabel } from '@/lib/i18n/label-helpers'

type IssueType =
  | 'only_error'
  | 'only_error_clockout'
  | 'only_error_break'
  | 'manual_punch'
  | 'only_deletes'
  | 'without_salary'
  | 'only_fixed'

type IssuesViewMode = 'individual' | 'grouped'

interface IssueCardConfig {
  type: IssueType
  title: string
  icon: React.ReactNode
  variant: KPICardVariant
}

/**
 * Tarjetas que siguen siendo filtro radio de un clic.
 *
 * Los tres tipos de error salieron de acá: ahora son incluir/excluir y se
 * renderizan aparte (ERROR_TYPE_META). El 20h+ NUNCA entra a la unión
 * `IssueType`: si entrara, rompe el `Record<IssueType,...>` exhaustivo de
 * ISSUE_CARD_META y en runtime `counts[card.type].pending` sería
 * `undefined.pending`, porque TtkIssueCountsData no tiene ese bucket.
 */
const ISSUE_CARD_TYPES: IssueType[] = [
  'only_error',
  'manual_punch',
  'only_deletes',
  'without_salary',
  'only_fixed',
]

/** Ícono y variante de cada tipo de error, por código (no por posición). */
const ERROR_TYPE_ICONS: Record<1 | 2 | 3, React.ReactNode> = {
  1: <LogOut className="h-5 w-5" />,
  2: <Coffee className="h-5 w-5" />,
  3: <Timer className="h-5 w-5" />,
}

const ERROR_TYPE_VARIANTS: Record<1 | 2 | 3, KPICardVariant> = {
  1: 'danger',
  2: 'warning',
  3: 'violet',
}

const ISSUE_CARD_META: Record<
  IssueType,
  { icon: React.ReactNode; variant: KPICardVariant }
> = {
  only_error: { icon: <AlertTriangle className="h-5 w-5" />, variant: 'warning' },
  only_error_clockout: { icon: <LogOut className="h-5 w-5" />, variant: 'danger' },
  only_error_break: { icon: <Coffee className="h-5 w-5" />, variant: 'warning' },
  manual_punch: { icon: <Hand className="h-5 w-5" />, variant: 'info' },
  only_deletes: { icon: <Trash2 className="h-5 w-5" />, variant: 'violet' },
  without_salary: { icon: <DollarSign className="h-5 w-5" />, variant: 'success' },
  only_fixed: { icon: <CheckCheck className="h-5 w-5" />, variant: 'info' },
}

export default function IssuesPage() {
  const { t } = useTranslation()
  const [viewMode, setViewMode] = useState<IssuesViewMode>('individual')
  const [punchMinHoursRaw, setPunchMinHoursRaw] = useState('')
  const [punchMaxHoursRaw, setPunchMaxHoursRaw] = useState('')
  const [paymentTypeFilter, setPaymentTypeFilter] =
    useState<PaymentTypeFilterValue>(PAYMENT_TYPE_FILTER_ALL)
  const {
    search,
    selectedEmployee,
    selectedDealers,
    dateRange,
    selectedType,
    setSelectedType,
    setSelectedTodayLiveStatus,
    filtersHydrated,
    excludedErrorTypes,
    includedErrorTypes,
    toggleErrorType,
    errorTypesReady,
  } = useFilters()

  const { user, hasPermission, loading: meLoading } = useSrsMe()
  const canViewDeleted = canDeletePunch(hasPermission, user?.isSystemAdmin)
  const canViewPayment = canViewPaymentType(hasPermission, user?.isSystemAdmin)
  const isExternal = Boolean(user?.isCompanyTypeCompany)

  const { data: paymentTypeOptions = [], isLoading: paymentTypesLoading } =
    usePaymentTypesCatalog(filtersHydrated && canViewPayment && !meLoading)

  // Externals cannot use issue-type KPI filters — clear any persisted selection.
  useEffect(() => {
    if (!isExternal || meLoading) return
    if (selectedType !== 'all') {
      setSelectedType('all')
    }
  }, [isExternal, meLoading, selectedType, setSelectedType])

  useEffect(() => {
    if (!canViewPayment) return
    if (selectedType === 'without_salary') {
      setPaymentTypeFilter(PAYMENT_TYPE_FILTER_WITHOUT)
    } else {
      setPaymentTypeFilter((prev) =>
        prev === PAYMENT_TYPE_FILTER_WITHOUT ? PAYMENT_TYPE_FILTER_ALL : prev,
      )
    }
  }, [selectedType, canViewPayment])

  const handlePaymentTypeFilterChange = (next: PaymentTypeFilterValue) => {
    setPaymentTypeFilter(next)
    if (next === PAYMENT_TYPE_FILTER_WITHOUT) {
      setSelectedType('without_salary')
      return
    }
    if (selectedType === 'without_salary') {
      setSelectedType('all')
    }
  }

  const visibleIssueCards = useMemo((): IssueCardConfig[] => {
    return ISSUE_CARD_TYPES.filter((type) => type !== 'only_deletes' || canViewDeleted).map(
      (type) => ({
        type,
        title: getIssueFilterLabel(t, type),
        ...ISSUE_CARD_META[type],
      }),
    )
  }, [canViewDeleted, t])

  const errorTypesActive = selectedType === 'only_error'
  // La exclusión sólo cuenta bajo `Only with errors`; si no, los contadores
  // muestran los números de siempre.
  const activeIncludedErrorTypes = errorTypesActive ? includedErrorTypes : ALL_ERROR_TYPES

  // Los contadores se piden SIEMPRE, incluso con los tres tipos destildados: son
  // la única fuente del número real que muestra cada tarjeta tachada.
  const { counts, loading } = useTtkIssueCounts({
    search,
    selectedDealers,
    dateRange,
    selectedEmployeeId: selectedEmployee?.id ?? null,
    filtersHydrated,
    includedErrorTypes: activeIncludedErrorTypes,
    errorTypesReady,
  })

  /**
   * Las tres tarjetas de tipo viven DENTRO de `Only with errors`.
   *
   * Sin ese filtro la tabla lista todas las ponchadas, así que "excluir un tipo"
   * no tiene sobre qué actuar: se muestran grisadas y sin efecto. Al prender
   * `Only with errors` se activan, arrancan las tres tildadas (o con la
   * exclusión guardada) y el usuario destilda la que no quiere ver.
   */
  const noErrorTypes = errorTypesActive && includedErrorTypes.length === 0

  const isExcluded = (code: number) => errorTypesActive && excludedErrorTypes.includes(code)

  const selectFilter = (type: string) => {
    const next = selectedType === type ? 'all' : type
    setSelectedType(next)
    if (next !== 'all') {
      setSelectedTodayLiveStatus(TODAY_LIVE_STATUS_ALL)
    }
  }

  /**
   * Con los tres tipos destildados el front NO manda `error_types` (un CSV vacío
   * sería un 400), así que el backend devuelve los agregados COMPLETOS. La
   * proyección a cero la hace el cliente: los contadores se siguen pidiendo
   * porque `by_type` es la única fuente del número real que muestra cada
   * tarjeta tachada.
   */
  const totalPending = noErrorTypes ? 0 : counts.only_error.pending

  const renderSubtitle = (type: IssueType): React.ReactNode => {
    if (type === 'only_error' && counts.only_error.by_type) {
      const { clock_out_missing, break_missing, shift_20h_plus } = counts.only_error.by_type
      return (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]">
          <span>
            {t('punch.clockOutBreakdown')}{' '}
            <span className="font-medium text-foreground">{clock_out_missing}</span>
          </span>
          <span>
            {t('punch.breakBreakdown')}{' '}
            <span className="font-medium text-foreground">{break_missing}</span>
          </span>
          <span>
            {t('punch.shift20hBreakdown')}{' '}
            <span className="font-medium text-foreground">{shift_20h_plus}</span>
          </span>
        </div>
      )
    }
    return null
  }

  return (
    <div className="space-y-8">
      <PageHeading
        title={t('punch.report')}
        subtitle={t('punch.reportSubtitle')}
        icon={<AlertTriangle />}
        variant="warning"
        actions={
          <Badge variant="secondary" className="gap-1.5 px-2.5 py-1">
            <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
            <span className="font-medium tabular-nums">
              {loading
                ? '…'
                : t('punch.withErrorsCount', { count: totalPending })}
            </span>
          </Badge>
        }
      />

      {!filtersHydrated || selectedDealers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('dealer.selectInHeader')}</p>
      ) : null}

      <PunchReportFilterPanel
        punchMinHours={punchMinHoursRaw}
        punchMaxHours={punchMaxHoursRaw}
        onPunchMinHoursChange={setPunchMinHoursRaw}
        onPunchMaxHoursChange={setPunchMaxHoursRaw}
        paymentTypeFilter={paymentTypeFilter}
        onPaymentTypeFilterChange={handlePaymentTypeFilterChange}
        paymentTypeOptions={paymentTypeOptions}
        showPaymentTypeFilter={canViewPayment && !meLoading}
        paymentTypesLoading={paymentTypesLoading}
        issueCards={
          isExternal
            ? null
            : (
              // Container queries, no media queries: lo que importa es el ancho
              // del área de contenido, no el del viewport. Con el sidebar abierto
              // el viewport puede tener 1540 y el panel sólo 1280.
              // A partir de 1280 de ANCHO PROPIO las cinco entran en una fila.
              <div className="@container/issue-cards space-y-5">
              <div className="grid grid-cols-1 gap-3 @[640px]/issue-cards:grid-cols-2 @[900px]/issue-cards:grid-cols-4 @[1280px]/issue-cards:grid-cols-5">
                {visibleIssueCards.map((card) => (
                  <KPICard
                    key={card.type}
                    title={card.title}
                    value={
                      // "Only with errors" es el único agregado de esta lista que
                      // depende de los tipos: con los tres destildados va a 0.
                      // Los otros cuatro no miran tipo de error.
                      card.type === 'only_error' ? totalPending : counts[card.type].pending
                    }
                    icon={card.icon}
                    variant={card.variant}
                    loading={loading}
                    filterCard
                    onClick={() => selectFilter(card.type)}
                    active={selectedType === card.type}
                    subtitle={renderSubtitle(card.type)}
                    hint={card.type === 'only_error' ? t('punch.onlyWithErrorsHint') : undefined}
                    hintKey={card.type === 'only_error' ? 'issues.only-with-errors' : undefined}
                  />
                ))}
              </div>

              {/*
                Segundo grupo, con su propio encabezado: estas tres NO son un
                filtro más de la lista, son un sub-filtro de `Only with errors`.
                Sin ese filtro se ven grisadas, para que no parezca que filtran.
              */}
              <div>
                <div className="mb-3 flex flex-wrap items-baseline gap-2">
                  <h4 className="text-[13px] font-semibold text-foreground">
                    {t('punch.errorTypesGroupTitle')}
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    {errorTypesActive
                      ? t('punch.errorTypesGroupHintOn')
                      : t('punch.errorTypesGroupHintOff')}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 @[640px]/issue-cards:grid-cols-2 @[900px]/issue-cards:grid-cols-3">
                {ERROR_TYPE_META.map((meta) => {
                  const excluded = isExcluded(meta.code)
                  return (
                    <KPICard
                      key={`error-type-${meta.code}`}
                      title={t(meta.labelKey)}
                      value={counts.only_error.by_type?.[meta.byTypeKey] ?? 0}
                      icon={ERROR_TYPE_ICONS[meta.code]}
                      variant={ERROR_TYPE_VARIANTS[meta.code]}
                      loading={loading}
                      filterCard
                      onClick={errorTypesActive ? () => toggleErrorType(meta.code) : undefined}
                      active={errorTypesActive && !excluded}
                      excluded={excluded}
                      inactive={!errorTypesActive}
                      hintKey="issues.error-types"
                      hint={
                        !errorTypesActive
                          ? t('punch.errorTypeHintInactive')
                          : excluded
                            ? t('punch.errorTypeHintExcluded', { type: t(meta.labelKey) })
                            : t('punch.errorTypeHintIncluded', { type: t(meta.labelKey) })
                      }
                    />
                  )
                })}
                </div>
              </div>
              </div>
            )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t('punch.filterPanelTitle')}</span>
        <div className="inline-flex rounded-md border border-border p-0.5">
          <Button
            type="button"
            size="sm"
            variant={viewMode === 'individual' ? 'default' : 'ghost'}
            className="h-7 gap-1.5 px-2.5"
            onClick={() => setViewMode('individual')}
          >
            <LayoutList className="h-3.5 w-3.5" />
            {t('punch.viewIndividual')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === 'grouped' ? 'default' : 'ghost'}
            className="h-7 gap-1.5 px-2.5"
            onClick={() => setViewMode('grouped')}
          >
            <Users className="h-3.5 w-3.5" />
            {t('punch.viewGrouped')}
          </Button>
        </div>
      </div>

      {viewMode === 'individual' ? (
        <IssuesDataTable
          punchMinHoursRaw={punchMinHoursRaw}
          punchMaxHoursRaw={punchMaxHoursRaw}
          paymentTypeFilter={paymentTypeFilter}
          onPaymentTypeFilterChange={handlePaymentTypeFilterChange}
          showToolbarFilters={false}
        />
      ) : (
        <GroupedIssuesDataTable
          punchMinHoursRaw={punchMinHoursRaw}
          punchMaxHoursRaw={punchMaxHoursRaw}
          paymentTypeFilter={paymentTypeFilter}
        />
      )}

    </div>
  )
}
