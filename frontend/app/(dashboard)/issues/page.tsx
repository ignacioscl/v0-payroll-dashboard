'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useFilters } from '@/lib/filter-context'
import { useTtkIssueCounts } from '@/hooks/use-ttk-issue-counts'
import { IssuesDataTable } from '@/components/ttk/issues-data-table'
import { GroupedIssuesDataTable } from '@/components/ttk/grouped-issues-table'
import { PunchReportFilterPanel } from '@/components/ttk/punch-report-filter-panel'
import { KPICard } from '@/components/dashboard/kpi-card'
import { PageHeading } from '@/components/layout/page-heading'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { canDeletePunch, canViewPaymentType } from '@/lib/auth/ttk-permissions'
import { usePaymentTypesCatalog } from '@/hooks/use-payment-types-catalog'
import {
  PAYMENT_TYPE_FILTER_ALL,
  type PaymentTypeFilterValue,
} from '@/lib/ttk/payment-type-filter'
import { TODAY_LIVE_STATUS_ALL } from '@/lib/ttk/today-live-status'
import {
  AlertTriangle,
  List,
  Info,
  LayoutList,
  Users,
} from 'lucide-react'
import { ALL_ERROR_TYPES } from '@/lib/filters/error-types-cookie'
import { visibleFlagTypes } from '@/lib/ttk/error-type-meta'
import { FlagTypeCards } from '@/components/ttk/flag-type-cards'
import { useTranslation } from '@/lib/i18n/locale-context'
import { effectiveErrorStatus, rangeStartsBeforeCorrectionsLog } from '@/lib/ttk/error-status'
import { Alert, AlertDescription } from '@/components/ui/alert'

type IssuesViewMode = 'individual' | 'grouped'

function IssuesPageContent() {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  // `?view=grouped` lo pone el click en un dealer del modal del Dashboard (F3).
  // Sólo decide la vista INICIAL: después el toggle Individual/Grouped es local.
  const viewFromUrl = searchParams.get('view')
  const [viewMode, setViewMode] = useState<IssuesViewMode>(() =>
    viewFromUrl === 'grouped' ? 'grouped' : 'individual',
  )
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
    errorStatus,
    setSelectedTodayLiveStatus,
    filtersHydrated,
    includedErrorTypes,
    toggleErrorType,
    errorTypesReady,
  } = useFilters()

  const { user, hasPermission, loading: meLoading } = useSrsMe()
  const canViewDeleted = canDeletePunch(hasPermission, user?.isSystemAdmin)
  const canViewPayment = canViewPaymentType(hasPermission, user?.isSystemAdmin)
  const isExternal = Boolean(user?.isCompanyTypeCompany)
  const visibleTypes = useMemo(
    () => visibleFlagTypes({ canViewPaymentType: canViewPayment, canViewDeleted }),
    [canViewPayment, canViewDeleted],
  )

  const { data: paymentTypeOptions = [], isLoading: paymentTypesLoading } =
    usePaymentTypesCatalog(filtersHydrated && canViewPayment && !meLoading)

  useEffect(() => {
    if (!isExternal || meLoading) return
    if (selectedType !== 'all') {
      setSelectedType('all')
    }
  }, [isExternal, meLoading, selectedType, setSelectedType])

  useEffect(() => {
    if (selectedType === 'only_error') setSelectedType('only_flagged')
    if (
      selectedType === 'manual_punch' ||
      selectedType === 'only_deletes' ||
      selectedType === 'without_salary'
    ) {
      setSelectedType('all')
    }
  }, [selectedType, setSelectedType])

  useEffect(() => {
    if (viewFromUrl == null) return
    router.replace('/issues', { scroll: false })
  }, [viewFromUrl, router])

  useEffect(() => {
    if (!canViewPayment) return
    if (selectedType === 'without_salary') {
      setPaymentTypeFilter(PAYMENT_TYPE_FILTER_ALL)
    }
  }, [selectedType, canViewPayment])

  const handlePaymentTypeFilterChange = (next: PaymentTypeFilterValue) => {
    setPaymentTypeFilter(next)
    if (next.ids.length > 0 && selectedType === 'without_salary') {
      setSelectedType('all')
    }
  }

  const activeErrorStatus = effectiveErrorStatus(selectedType, errorStatus)
  const isCorrectedMode = activeErrorStatus === 'corrected'
  const errorTypesActive = selectedType === 'only_flagged' || selectedType === 'only_error'
  const activeIncludedErrorTypes = errorTypesActive ? includedErrorTypes : ALL_ERROR_TYPES

  const { counts, loading } = useTtkIssueCounts({
    search,
    selectedDealers,
    dateRange,
    selectedEmployeeId: selectedEmployee?.id ?? null,
    filtersHydrated,
    includedErrorTypes: activeIncludedErrorTypes,
    errorTypesReady,
  })

  const noErrorTypes = errorTypesActive && includedErrorTypes.length === 0

  const selectShow = (type: 'all' | 'only_flagged') => {
    setSelectedType(type)
    if (type !== 'all') {
      setSelectedTodayLiveStatus(TODAY_LIVE_STATUS_ALL)
    }
  }

  const flaggedTotal = noErrorTypes
    ? 0
    : isCorrectedMode
      ? counts.only_fixed.pending
      : counts.only_flagged.pending
  const activeErrorBucket = isCorrectedMode ? counts.only_fixed : counts.only_error

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
                : isCorrectedMode
                  ? [
                      t(
                        flaggedTotal === 1 ? 'punch.correctionsOne' : 'punch.correctionsMany',
                        { count: flaggedTotal },
                      ),
                      t(
                        (counts.only_fixed.punches ?? 0) === 1
                          ? 'punch.punchesOne'
                          : 'punch.punchesMany',
                        { count: counts.only_fixed.punches ?? 0 },
                      ),
                    ].join(' · ')
                  : errorTypesActive
                    ? t('punch.withErrorsCount', { count: flaggedTotal })
                    : t(
                        counts.total_punches === 1 ? 'punch.punchesOne' : 'punch.punchesMany',
                        { count: counts.total_punches },
                      )}
            </span>
          </Badge>
        }
      />

      {!filtersHydrated || selectedDealers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('dealer.selectInHeader')}</p>
      ) : null}

      {/* Mismo aviso que el Dashboard: la bitácora de correcciones arrancó el
          2026-08-27 y no hubo backfill, así que antes de esa fecha la historia
          puede estar incompleta. Faltaba en esta pantalla. */}
      {rangeStartsBeforeCorrectionsLog(dateRange?.from) ? (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>{t('punch.correctionsCoverageNotice')}</AlertDescription>
        </Alert>
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
              <div className="@container/flag-types space-y-5">
              <div className="grid grid-cols-1 gap-3 @[640px]/flag-types:grid-cols-2">
                <KPICard
                  title={t('punch.allPunches')}
                  value={counts.total_punches}
                  icon={<List className="h-5 w-5" />}
                  variant="default"
                  loading={loading}
                  filterCard
                  inline
                  onClick={() => selectShow('all')}
                  active={selectedType === 'all'}
                  hint={t('punch.allPunchesHint')}
                  hintKey="issues.all-punches"
                />
                <KPICard
                  title={`${t('punch.onlyFlagged')}${isCorrectedMode ? ` ${t('punch.errorStatusCorrected')}` : ''}`}
                  value={flaggedTotal}
                  icon={<AlertTriangle className="h-5 w-5" />}
                  variant="warning"
                  loading={loading}
                  filterCard
                  inline
                  onClick={() => selectShow('only_flagged')}
                  active={errorTypesActive}
                  hint={t('punch.onlyFlaggedHint')}
                  hintKey="issues.only-flagged"
                />
              </div>
              <FlagTypeCards
                status={activeErrorStatus}
                visibleMetas={visibleTypes}
                byType={activeErrorBucket.by_type}
                fakeGpsWithData={counts.fake_gps.with_data}
                includedErrorTypes={includedErrorTypes}
                typesActive={errorTypesActive}
                onToggle={toggleErrorType}
                loading={loading}
              />
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

/**
 * Next 16 exige `Suspense` alrededor de un componente que usa `useSearchParams()`.
 * Mismo patrón que `app/login/page.tsx`.
 */
export default function IssuesPage() {
  return (
    <Suspense fallback={null}>
      <IssuesPageContent />
    </Suspense>
  )
}
