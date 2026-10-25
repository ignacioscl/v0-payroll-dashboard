'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Target } from 'lucide-react'
import { ProductionDealerTable } from '@/components/dashboard/production-dealer-table'
import { PageHeading } from '@/components/layout/page-heading'
import { ReportRulesNotice } from '@/components/shared/report-rules-notice'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useFilters } from '@/lib/filter-context'
import { formatDateParam } from '@/lib/ttk/map-header-filters'
import { useTranslation } from '@/lib/i18n/locale-context'
import { fetchProductionByDealer, type KpiQueryParams } from '@/lib/srs-kpis-api'

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

export default function ProductionVsGoalPage() {
  const { t } = useTranslation()
  const { dateRange, selectedDealers, filtersHydrated } = useFilters()
  const [filterDateDone, setFilterDateDone] = useState(false)

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

  const kpiParams = useMemo((): KpiQueryParams | null => {
    if (!rangeReady) return null
    return {
      fechaDesde: headerRange.fechaDesde,
      fechaHasta: headerRange.fechaHasta,
      idDealer,
      filterDateDone,
    }
  }, [rangeReady, headerRange, idDealer, filterDateDone])

  const prodDealer = useQuery({
    queryKey: ['srs-kpi', 'production-by-dealer', kpiParams],
    queryFn: () => fetchProductionByDealer(kpiParams!),
    enabled: Boolean(kpiParams),
  })

  return (
    <div className="space-y-6">
      <PageHeading
        title={t('mockKpis.chartProductionVsGoal')}
        subtitle={
          headerRangeLabel ? (
            <span className="tabular-nums">{headerRangeLabel}</span>
          ) : undefined
        }
        icon={<Target />}
        variant="success"
      />

      <ReportRulesNotice screen="productionVsGoal" />

      {!filtersHydrated || selectedDealers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('dealer.selectInHeader')}</p>
      ) : !headerRange.fechaDesde ? (
        <p className="text-sm text-muted-foreground">{t('filters.selectDates')}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <Switch
          id="filter-date-done-production-vs-goal"
          checked={filterDateDone}
          onCheckedChange={setFilterDateDone}
          disabled={!rangeReady}
        />
        <Label
          htmlFor="filter-date-done-production-vs-goal"
          className="cursor-pointer text-sm font-normal"
        >
          {t('businessKpis.filterDateDone')}
        </Label>
      </div>

      {prodDealer.isError && !prodDealer.isLoading ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {prodDealer.error instanceof Error
            ? prodDealer.error.message
            : t('common.failedToLoad')}
        </div>
      ) : null}

      <ProductionDealerTable data={prodDealer.data} loading={prodDealer.isLoading} />
    </div>
  )
}
