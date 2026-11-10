'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import type { ColumnDef } from '@tanstack/react-table'
import { CalendarRange, ChevronDown, ChevronRight, FileSpreadsheet, Landmark, Loader2, Rows3, Table2 } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { toast } from 'sonner'
import { BillingActionDialog, BillingOptionTile } from '@/components/billing/billing-action-dialog'
import { KPICard } from '@/components/dashboard/kpi-card'
import { PageHeading } from '@/components/layout/page-heading'
import { IncomeDealerServices } from '@/components/reports/income-dealer-services'
import { ReportRulesNotice } from '@/components/shared/report-rules-notice'
import {
  DataTable,
  DataTableColumnHeader,
  type DataTableColumnMeta,
} from '@/components/shared/data-table'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { RemovedDealerBadge } from '@/components/filters/removed-dealer-badge'
import { RemovedDealersSwitch } from '@/components/filters/removed-dealers-switch'
import { useIsMobile } from '@/hooks/use-mobile'
import { useRemovedDealersSwitch } from '@/hooks/use-removed-dealers-available'
import { useSrsDealers } from '@/hooks/use-srs-dealers'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { useFilters } from '@/lib/filter-context'
import { formatUsCalendarDate } from '@/lib/format-us-datetime'
import { useTranslation, type TranslateFn } from '@/lib/i18n/locale-context'
import { fmtMoney, fmtMoneyAxis } from '@/lib/kpi-money'
import { exportIncomeByDealerXlsx } from '@/lib/reports/income-by-dealer-export'
import { collectIncomeServices, exportIncomeServicesXlsx } from '@/lib/reports/income-by-dealer-services-export'
import {
  fetchIncomeByDealer,
  fetchIncomeByDealerServices,
  type IncomeByDealer,
  type IncomeByDealerRow,
  type IncomeByDealerYear,
  type KpiQueryParams,
} from '@/lib/srs-kpis-api'
import { isSrsBusyError } from '@/lib/srs-busy-error'
import { TOAST_DURATION_MS } from '@/lib/toast-config'
import { formatDateParam } from '@/lib/ttk/map-header-filters'
import { cn } from '@/lib/utils'

type ExportKind = 'income' | 'services'

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

/**
 * «2024», or «2026 YTD» when the range starts on Jan 1 and stops before Dec 31 — or, with «By
 * year», the year in course (the front sends it to Dec 31, but there is no work after today).
 */
function yearLabel(y: IncomeByDealerYear, t: TranslateFn): string {
  const inCourse = y.year === new Date().getFullYear() && y.fechaDesde === `${y.year}-01-01`
  if ((y.partial || inCourse) && y.fechaDesde === `${y.year}-01-01`) {
    return t('incomeByDealer.yearYtd', { year: y.year })
  }
  return String(y.year)
}

function yearRange(y: IncomeByDealerYear): string {
  return `${formatUsCalendarDate(y.fechaDesde)} – ${formatUsCalendarDate(y.fechaHasta)}`
}

// Same card grid as Business KPIs: one per row on mobile.
const KPI_CARD_GRID = 'grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))]'

export default function IncomeByDealerPage() {
  const { t } = useTranslation()
  const { user } = useSrsMe()
  const { dealers } = useSrsDealers()
  const { dateRange, selectedDealers, filtersHydrated, incomeYearMode, incomeYears } = useFilters()
  const [filterDateDone, setFilterDateDone] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportKind, setExportKind] = useState<ExportKind>('income')
  const isMobile = useIsMobile()
  // Names wrap on mobile, never cut with «…» (rule of tables on mobile); one line on desktop.
  const wrap = isMobile ? 'whitespace-normal break-words' : 'truncate'

  const idDealer = useMemo(() => selectedDealers.join(','), [selectedDealers])

  // «By year»: the checked years, newest first. The backend gets one range, from Jan 1 of the
  // oldest to Dec 31 of the newest; a year in between that is not checked is dropped from the answer.
  const selectedYears = useMemo(
    () => (incomeYearMode ? [...incomeYears].sort((a, b) => b - a) : []),
    [incomeYearMode, incomeYears],
  )

  const headerRange = useMemo(() => {
    if (incomeYearMode) {
      if (selectedYears.length === 0) return { fechaDesde: '', fechaHasta: '' }
      return {
        fechaDesde: `${selectedYears[selectedYears.length - 1]}-01-01`,
        fechaHasta: `${selectedYears[0]}-12-31`,
      }
    }
    const fechaDesde = formatDateParam(dateRange?.from)
    const fechaHasta = formatDateParam(dateRange?.to ?? dateRange?.from)
    return { fechaDesde, fechaHasta }
  }, [dateRange, incomeYearMode, selectedYears])

  const headerRangeLabel = useMemo(
    () =>
      incomeYearMode
        ? selectedYears.length > 0
          ? selectedYears.join(', ')
          : null
        : formatUsDateRange(dateRange?.from, dateRange?.to),
    [dateRange, incomeYearMode, selectedYears],
  )

  const rangeReady =
    filtersHydrated && selectedDealers.length > 0 && Boolean(headerRange.fechaDesde)

  const removedDealers = useRemovedDealersSwitch({
    fechaDesde: headerRange.fechaDesde,
    fechaHasta: headerRange.fechaHasta,
    filterDateDone,
    ready: rangeReady,
  })
  const includeRemovedDealers = removedDealers.include
  const removedIds = removedDealers.removedIds

  const kpiParams = useMemo((): KpiQueryParams | null => {
    if (!rangeReady) return null
    return {
      fechaDesde: headerRange.fechaDesde,
      fechaHasta: headerRange.fechaHasta,
      idDealer,
      filterDateDone,
      includeRemovedDealers,
    }
  }, [rangeReady, headerRange, idDealer, filterDateDone, includeRemovedDealers])

  const income = useQuery({
    queryKey: ['srs-kpi', 'income-by-dealer', kpiParams],
    queryFn: () => fetchIncomeByDealer(kpiParams!),
    enabled: Boolean(kpiParams),
    // Only «Filter by completion date» or «Include removed dealers» changed: keep the tables (and the open rows) while
    // it reloads (M1 of plans/plan-income-by-dealer-por-servicio). Other dates or dealers: nothing kept, as before.
    placeholderData: (prev: IncomeByDealer | undefined, prevQuery) => {
      const before = prevQuery?.queryKey[2] as KpiQueryParams | null | undefined
      if (!prev || !before || !kpiParams) return undefined
      return before.fechaDesde === kpiParams.fechaDesde &&
        before.fechaHasta === kpiParams.fechaHasta &&
        before.idDealer === kpiParams.idDealer
        ? prev
        : undefined
    },
  })
  const data = useMemo(() => {
    const raw = income.data
    if (!raw || !incomeYearMode) return raw
    const keep = new Set(selectedYears)
    const years = raw.years.filter((y) => keep.has(y.year))
    const grandCents = years.reduce((acc, y) => acc + Math.round(y.total * 100), 0)
    return { years, grandTotal: grandCents / 100 }
  }, [income.data, incomeYearMode, selectedYears])

  const chartData = useMemo(
    () => (data?.years ?? []).map((y) => ({ label: yearLabel(y, t), income: y.total })),
    [data, t],
  )

  const columns = useMemo<ColumnDef<IncomeByDealerRow>[]>(
    () => [
      {
        accessorKey: 'dealer',
        size: 280,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('dealer.label')} />,
        // The arrow opens the services of the dealer (plans/plan-income-by-dealer-por-servicio §5.2), as in Expenses.
        cell: ({ row }) => {
          const expanded = row.getIsExpanded()
          return (
            <span className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  row.toggleExpanded()
                }}
                aria-expanded={expanded}
                aria-label={expanded ? t('incomeByDealer.hideServices') : t('incomeByDealer.showServices')}
                className={cn('flex min-w-0 cursor-pointer items-center gap-1 text-left font-medium', wrap)}
              >
                {expanded ? (
                  <ChevronDown className="size-3.5 shrink-0" />
                ) : (
                  <ChevronRight className="size-3.5 shrink-0" />
                )}
                <span className={wrap}>{row.original.dealer}</span>
              </button>
              {removedIds.has(row.original.dealerId) ? <RemovedDealerBadge /> : null}
            </span>
          )
        },
        meta: {
          label: t('dealer.label'),
          exportValue: (row) =>
            removedIds.has(row.dealerId)
              ? `${row.dealer} ${t('businessKpis.removedDealerSuffix')}`
              : row.dealer,
        } satisfies DataTableColumnMeta<IncomeByDealerRow>,
      },
      {
        accessorKey: 'income',
        size: 180,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('incomeByDealer.colIncome')} />
        ),
        cell: ({ row }) => fmtMoney(row.original.income),
        meta: {
          label: t('incomeByDealer.colIncome'),
          numeric: true,
          money: true,
          exportValue: (row) => row.income,
        } satisfies DataTableColumnMeta<IncomeByDealerRow>,
      },
    ],
    [t, removedIds, wrap],
  )

  const busyMessage = income.isError
    ? isSrsBusyError(income.error)
      ? t('common.serverBusy')
      : income.error instanceof Error
        ? income.error.message
        : t('common.failedToLoad')
    : null

  const handleExport = async () => {
    if (!data) return
    setExporting(true)
    try {
      if (exportKind === 'services') {
        await handleExportServices(data)
        setExportOpen(false)
        return
      }
      const allDealers =
        dealers.length > 0 && dealers.every((d) => selectedDealers.includes(d.id))
      const dealerNames = allDealers
        ? t('dealer.all')
        : dealers
            .filter((d) => selectedDealers.includes(d.id))
            .map((d) => d.label)
            .join(', ')
      const yes = t('incomeByDealer.yes')
      const no = t('incomeByDealer.no')
      // Removed dealers with a row in the file, once each (§5, M2).
      const removedNames = [
        ...new Set(data.years.flatMap((y) => y.dealers.filter((d) => removedIds.has(d.dealerId)).map((d) => d.dealer))),
      ]
      await exportIncomeByDealerXlsx({
        data,
        removedIds,
        removedNames,
        generatedBy: user?.nombre ?? '',
        labels: {
          fileName: 'income-by-dealer',
          reportInfoSheet: 'Report Info',
          dataSheet: t('incomeByDealer.title'),
          summarySheet: t('incomeByDealer.summarySheet'),
          title: t('incomeByDealer.title'),
          field: t('incomeByDealer.exportField'),
          value: t('incomeByDealer.exportValue'),
          dealer: t('dealer.label'),
          income: t('incomeByDealer.colIncome'),
          period: t('incomeByDealer.colPeriod'),
          dates: t('incomeByDealer.colDates'),
          total: t('incomeByDealer.total'),
          grandTotal: t('incomeByDealer.grandTotal'),
          generated: t('incomeByDealer.exportGenerated'),
          removedSuffix: t('businessKpis.removedDealerSuffix'),
          includesRemovedDealers: t('businessKpis.includesRemovedDealers'),
          yearLabel: (y) => yearLabel(y, t),
          yearRange,
        },
        reportInfo: [
          { field: t('incomeByDealer.exportGeneratedBy'), value: user?.nombre ?? '' },
          { field: t('incomeByDealer.exportScreen'), value: `${t('nav.reports')} › ${t('incomeByDealer.title')}` },
          incomeYearMode
            ? { field: t('incomeByDealer.exportYears'), value: headerRangeLabel ?? '' }
            : { field: t('incomeByDealer.exportDates'), value: headerRangeLabel ?? '' },
          { field: t('dealer.labelPlural'), value: dealerNames },
          { field: t('businessKpis.filterDateDone'), value: filterDateDone ? yes : no },
          ...(includeRemovedDealers
            ? [
                {
                  field: t('businessKpis.includeRemovedDealers'),
                  value: removedNames.length ? `${yes} — ${removedNames.join(', ')}` : yes,
                },
              ]
            : []),
        ],
      })
      toast.success(t('common.exportSuccess', { count: data.years.length }), { duration: TOAST_DURATION_MS })
      setExportOpen(false)
    } catch (e) {
      toast.error(t('common.exportFailed'), { duration: TOAST_DURATION_MS })
      // eslint-disable-next-line no-console
      console.error('[IncomeByDealerExport]', e)
    } finally {
      setExporting(false)
    }
  }

  /**
   * «By dealer and service» (plans/plan-income-by-dealer-por-servicio §5.3 and T4): one dealer and one year per request,
   * each dealer checked to the cent against its row before the file is built.
   */
  const handleExportServices = async (screen: IncomeByDealer) => {
    const allDealers = dealers.length > 0 && dealers.every((d) => selectedDealers.includes(d.id))
    const dealerNames = allDealers
      ? t('dealer.all')
      : dealers
          .filter((d) => selectedDealers.includes(d.id))
          .map((d) => d.label)
          .join(', ')
    const yes = t('incomeByDealer.yes')
    const no = t('incomeByDealer.no')
    const removedNames = [
      ...new Set(screen.years.flatMap((y) => y.dealers.filter((d) => removedIds.has(d.dealerId)).map((d) => d.dealer))),
    ]
    const years = await collectIncomeServices(screen, { filterDateDone }, fetchIncomeByDealerServices)
    const title = t('incomeByDealer.servicesTitle')
    await exportIncomeServicesXlsx({
      years,
      removedIds,
      removedNames,
      generatedBy: user?.nombre ?? '',
      labels: {
        fileName: 'income-by-dealer-and-service',
        reportInfoSheet: 'Report Info',
        summarySheet: t('incomeByDealer.summarySheet'),
        vehiclesSheet: t('incomeByDealer.colVehicles'),
        title,
        field: t('incomeByDealer.exportField'),
        value: t('incomeByDealer.exportValue'),
        generated: t('incomeByDealer.exportGenerated'),
        dealer: t('dealer.label'),
        total: t('incomeByDealer.total'),
        grandTotal: t('incomeByDealer.grandTotal'),
        removedSuffix: t('businessKpis.removedDealerSuffix'),
        includesRemovedDealers: t('businessKpis.includesRemovedDealers'),
        sectionWo: t('incomeByDealer.sectionWo'),
        sectionGeneric: t('incomeByDealer.sectionGeneric'),
        sectionTtk: t('incomeByDealer.sectionTtk'),
        service: t('incomeByDealer.colService'),
        description: t('incomeByDealer.colDescription'),
        employee: t('incomeByDealer.colEmployee'),
        qty: t('incomeByDealer.colQty'),
        vehicles: t('incomeByDealer.colVehicles'),
        income: t('incomeByDealer.colIncome'),
        totalWo: t('incomeByDealer.totalWo'),
        totalGeneric: t('incomeByDealer.totalGeneric'),
        totalTtk: t('incomeByDealer.totalTtk'),
        totalDealer: (dealer) => t('incomeByDealer.totalDealer', { dealer }),
        woQty: t('incomeByDealer.colWoQty'),
        woIncome: t('incomeByDealer.colWoIncome'),
        otherIncome: t('incomeByDealer.colOtherIncome'),
        period: t('incomeByDealer.colPeriod'),
        vin: t('incomeByDealer.colVin'),
        make: t('incomeByDealer.colMake'),
        model: t('incomeByDealer.colModel'),
        carYear: t('incomeByDealer.colYear'),
        services: t('incomeByDealer.colServices'),
        yearLabel: (y) => yearLabel(y, t),
        yearRange,
      },
      reportInfo: [
        { field: t('incomeByDealer.exportGeneratedBy'), value: user?.nombre ?? '' },
        { field: t('incomeByDealer.exportScreen'), value: `${t('nav.reports')} › ${t('incomeByDealer.title')}` },
        incomeYearMode
          ? { field: t('incomeByDealer.exportYears'), value: headerRangeLabel ?? '' }
          : { field: t('incomeByDealer.exportDates'), value: headerRangeLabel ?? '' },
        { field: t('dealer.labelPlural'), value: dealerNames },
        { field: t('businessKpis.filterDateDone'), value: filterDateDone ? yes : no },
        ...(includeRemovedDealers
          ? [
              {
                field: t('businessKpis.includeRemovedDealers'),
                value: removedNames.length ? `${yes} — ${removedNames.join(', ')}` : yes,
              },
            ]
          : []),
        { field: t('incomeByDealer.sectionWo'), value: t('incomeByDealer.infoWorkOrders') },
        { field: t('incomeByDealer.colWoQty'), value: t('incomeByDealer.infoWoQty') },
        { field: t('incomeByDealer.colVehicles'), value: t('incomeByDealer.infoVehicles') },
        { field: t('incomeByDealer.sectionGeneric'), value: t('incomeByDealer.infoGeneric') },
        { field: t('incomeByDealer.sectionTtk'), value: t('incomeByDealer.infoTtk') },
      ],
    })
    toast.success(t('common.exportSuccess', { count: screen.years.length }), { duration: TOAST_DURATION_MS })
  }

  return (
    <div className="space-y-6">
      <PageHeading
        title={t('incomeByDealer.title')}
        subtitle={
          headerRangeLabel ? <span className="tabular-nums">{headerRangeLabel}</span> : undefined
        }
        icon={<Landmark />}
        variant="success"
        titleAside={<ReportRulesNotice screen="incomeByDealer" />}
      />

      {!filtersHydrated || selectedDealers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('dealer.selectInHeaderToLoad')}</p>
      ) : !headerRange.fechaDesde ? (
        <p className="text-sm text-muted-foreground">
          {incomeYearMode ? t('incomeByDealer.selectYears') : t('filters.selectDates')}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <Switch
            id="filter-date-done-income-by-dealer"
            checked={filterDateDone}
            onCheckedChange={setFilterDateDone}
            disabled={!rangeReady}
          />
          <Label
            htmlFor="filter-date-done-income-by-dealer"
            className="cursor-pointer text-sm font-normal"
          >
            {t('businessKpis.filterDateDone')}
          </Label>
        </div>
        <RemovedDealersSwitch
          id="include-removed-dealers-income-by-dealer"
          state={removedDealers}
          disabled={!rangeReady}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto gap-1.5"
          disabled={!data || exporting || income.isFetching}
          onClick={() => setExportOpen(true)}
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
          ) : (
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
          )}
          {exporting ? t('common.exporting') : t('common.export')}
        </Button>
      </div>

      <BillingActionDialog
        open={exportOpen}
        onOpenChange={(o) => {
          if (!exporting) setExportOpen(o)
        }}
        tone="emerald"
        icon={FileSpreadsheet}
        title={t('common.export')}
        cancelLabel={t('common.cancel')}
        confirmLabel={t('common.export')}
        confirmIcon={FileSpreadsheet}
        onConfirm={() => void handleExport()}
        pending={exporting}
        pendingLabel={t('common.exporting')}
        confirmDisabled={!data || income.isFetching}
      >
        <div className="grid gap-1.5 sm:grid-cols-2">
          <BillingOptionTile
            selected={exportKind === 'income'}
            onSelect={() => setExportKind('income')}
            title={t('incomeByDealer.exportIncomeTitle')}
            description={t('incomeByDealer.exportIncomeDescription')}
            icon={Table2}
            disabled={exporting}
          />
          <BillingOptionTile
            selected={exportKind === 'services'}
            onSelect={() => setExportKind('services')}
            title={t('incomeByDealer.exportServicesTitle')}
            description={t('incomeByDealer.exportServicesDescription')}
            icon={Rows3}
            disabled={exporting}
          />
        </div>
      </BillingActionDialog>

      {busyMessage && !income.isLoading ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {busyMessage}
        </div>
      ) : null}

      <div className={KPI_CARD_GRID}>
        {(income.isLoading ? [] : (data?.years ?? [])).map((y) => (
          <KPICard
            key={y.year}
            inline
            title={yearLabel(y, t)}
            value={fmtMoney(y.total)}
            subtitle={<span className="tabular-nums">{yearRange(y)}</span>}
            icon={<CalendarRange className="h-5 w-5" />}
            variant="info"
          />
        ))}
        <KPICard
          inline
          loading={income.isLoading}
          title={t('incomeByDealer.allPeriods')}
          value={data ? fmtMoney(data.grandTotal) : '—'}
          subtitle={headerRangeLabel ? <span className="tabular-nums">{headerRangeLabel}</span> : ''}
          icon={<Landmark className="h-5 w-5" />}
          variant="success"
        />
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base">{t('incomeByDealer.chartTitle')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('mockKpis.chartNoTaxNote')}</p>
        </CardHeader>
        <CardContent>
          {income.isLoading ? (
            <div className="flex h-[260px] items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="label" fontSize={12} tickMargin={8} />
                <YAxis fontSize={12} width={64} tickFormatter={(v) => fmtMoneyAxis(Number(v))} />
                <Tooltip formatter={(value: number) => fmtMoney(value)} />
                <Bar
                  dataKey="income"
                  name={t('incomeByDealer.colIncome')}
                  fill="var(--chart-1)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {(data?.years ?? []).map((y) => (
        <div key={y.year} className="min-w-0">
          <DataTable<IncomeByDealerRow>
            tableId="income-by-dealer-year"
            columns={columns}
            data={y.dealers}
            getRowId={(row) => String(row.dealerId)}
            isLoading={income.isFetching}
            defaultPageSize={25}
            includeAllPageSize
            enableGlobalFilter={false}
            enableExport={false}
            recordsCount={y.dealers.length}
            recordsCountLabel={t('dealer.labelPlural')}
            renderSubComponent={(row) => (
              <IncomeDealerServices
                dealerId={row.original.dealerId}
                fechaDesde={y.fechaDesde}
                fechaHasta={y.fechaHasta}
                filterDateDone={filterDateDone}
                wrap={wrap}
              />
            )}
            subComponentLayout="full"
            toolbarLeading={
              <div className="flex min-w-0 flex-col">
                <span className="text-base font-semibold">{yearLabel(y, t)}</span>
                <span className="text-xs font-normal tabular-nums text-muted-foreground">
                  {yearRange(y)}
                </span>
              </div>
            }
            footer={
              <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-sm font-semibold">
                <span>{t('incomeByDealer.total')} {yearLabel(y, t)}</span>
                <span className="tabular-nums">{fmtMoney(y.total)}</span>
              </div>
            }
            emptyState={
              <p className="py-8 text-center text-sm text-muted-foreground">{t('incomeByDealer.noData')}</p>
            }
          />
        </div>
      ))}

      {data && data.years.length > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-base font-semibold">
          <span>{t('incomeByDealer.grandTotal')}</span>
          <span className="tabular-nums">{fmtMoney(data.grandTotal)}</span>
        </div>
      ) : null}
    </div>
  )
}
