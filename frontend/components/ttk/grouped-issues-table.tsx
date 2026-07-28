'use client'

import * as React from 'react'
import type { ColumnDef, Row, SortingState } from '@tanstack/react-table'
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import {
  DataTable,
  DataTableColumnHeader,
  createPaginatedAdapter,
  useDataTableQuery,
  type DataTableColumnMeta,
} from '@/components/shared/data-table'
import { useFilters } from '@/lib/filter-context'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
import { fetchPunchGrouped } from '@/lib/srs-kpis-api'
import { buildPunchGroupedParams } from '@/lib/ttk/punch-grouped-filters'
import { formatGroupedHoursDisplay } from '@/lib/ttk/format-grouped-hours'
import { buildTtkListFilterExtra, toPayrollScopeUser } from '@/lib/ttk/map-header-filters'
import type { PunchGroupedRow } from '@/lib/ttk/punch-grouped-types'
import type { PaymentTypeFilterValue } from '@/lib/ttk/payment-type-filter'
import { IssuesDataTable } from '@/components/ttk/issues-data-table'
import { PunchErrorIndicator } from '@/components/ttk/punch-error-indicator'
import { GroupedPunchExportButton } from '@/components/ttk/grouped-punch-export-button'
import type { PunchGroupedExportLabels } from '@/lib/ttk/punch-grouped-export'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { canViewPaymentType } from '@/lib/auth/ttk-permissions'
import { TODAY_LIVE_STATUS_ALL } from '@/lib/ttk/today-live-status'
import { useTranslation } from '@/lib/i18n/locale-context'

const groupedAdapter = createPaginatedAdapter<PunchGroupedRow>()

const GROUPED_HOURS_FORMAT_STORAGE_KEY = 'punch.grouped.hoursFormat'

function readGroupedHoursFormatPreference(): boolean {
  if (typeof window === 'undefined') return true
  const stored = window.localStorage.getItem(GROUPED_HOURS_FORMAT_STORAGE_KEY)
  if (stored === '0') return false
  return true
}

function paymentTypeHours(row: PunchGroupedRow, label: string): number | null {
  const match = row.byPaymentType.find((pt) => pt.label === label)
  return match ? match.hoursNumber : null
}

function GroupedPunchDetail({
  row,
  useHoursFormat,
}: {
  row: PunchGroupedRow
  useHoursFormat: boolean
}) {
  const { t } = useTranslation()
  const employeeId = Number(row.idUsuario)

  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    return (
      <div className="px-4 py-3 text-xs text-muted-foreground">
        {t('punch.loadDetailsFailed')}
      </div>
    )
  }

  return (
    <div className="min-w-0 overflow-x-auto border-l-[3px] border-l-primary/40 bg-muted/20 px-4 py-3">
      <p className="mb-3 text-sm font-medium">
        {t('punch.punchesForEmployee', { name: row.nombreEmployee })}
      </p>
      <IssuesDataTable
        employeeIdOverride={employeeId}
        ignoreSearch
        showToolbarFilters={false}
        tableId={`grouped-detail-${employeeId}`}
        defaultPageSize={10}
        exportFileName={`punch-detail-${employeeId}`}
        queryKeySuffix={`grouped-${employeeId}`}
        tableScrollHeight={false}
        enableExport={false}
        enableTableFocus={false}
        groupedHoursFormat={useHoursFormat}
      />
    </div>
  )
}

export type GroupedIssuesDataTableProps = {
  punchMinHoursRaw?: string
  punchMaxHoursRaw?: string
  paymentTypeFilter?: PaymentTypeFilterValue
}

export function GroupedIssuesDataTable({
  punchMinHoursRaw = '',
  punchMaxHoursRaw = '',
  paymentTypeFilter,
}: GroupedIssuesDataTableProps) {
  const { t } = useTranslation()
  const {
    selectedEmployee,
    selectedDealers,
    selectedType,
    selectedTodayLiveStatus,
    dateRange,
    filtersHydrated,
  } = useFilters()

  const { user, hasPermission } = useSrsMe()
  const canViewPayment = canViewPaymentType(hasPermission, user?.isSystemAdmin)

  const [pageIndex, setPageIndex] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(25)
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'employee', desc: false },
  ])
  const [rowSelection, setRowSelection] = React.useState<Record<string, boolean>>({})
  const [employeeSearch, setEmployeeSearch] = React.useState('')
  const [useHoursFormat, setUseHoursFormat] = React.useState(true)

  React.useEffect(() => {
    setUseHoursFormat(readGroupedHoursFormatPreference())
  }, [])

  const handleHoursFormatChange = React.useCallback((checked: boolean) => {
    setUseHoursFormat(checked)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(GROUPED_HOURS_FORMAT_STORAGE_KEY, checked ? '1' : '0')
    }
  }, [])

  const debouncedDealers = useDebouncedValue(selectedDealers, 450)
  const debouncedEmployeeSearch = useDebouncedValue(employeeSearch, 300)
  const debouncedMinHours = useDebouncedValue(punchMinHoursRaw, 600)
  const debouncedMaxHours = useDebouncedValue(punchMaxHoursRaw, 600)
  const minHoursTotal = debouncedMinHours !== '' ? Number(debouncedMinHours) : null
  const maxHoursTotal = debouncedMaxHours !== '' ? Number(debouncedMaxHours) : null

  const sortCol = sorting[0]?.id
  const sortDir = sorting[0]?.desc ? 'desc' : 'asc'

  const listExtra = React.useMemo(
    () =>
      buildPunchGroupedParams({
        selectedDealers: debouncedDealers,
        dateRange,
        selectedType,
        selectedEmployeeId: selectedEmployee?.id ?? null,
        search: debouncedEmployeeSearch,
        page: pageIndex + 1,
        pageSize,
        sort:
          sortCol === 'employee'
            ? 'nombreEmployee'
            : sortCol === 'hoursNumber' || sortCol === 'breakNumber'
              ? sortCol
              : 'nombreEmployee',
        dir: sortDir as 'asc' | 'desc',
        minHoursTotal,
        maxHoursTotal,
        paymentTypeFilter,
      }),
    [
      debouncedDealers,
      dateRange,
      selectedType,
      selectedEmployee?.id,
      debouncedEmployeeSearch,
      pageIndex,
      pageSize,
      sortCol,
      sortDir,
      minHoursTotal,
      maxHoursTotal,
      paymentTypeFilter,
    ],
  )

  const queryEnabled =
    filtersHydrated &&
    debouncedDealers.length > 0 &&
    Boolean(listExtra.fechaDesde) &&
    Boolean(listExtra.fechaHasta)

  const groupedParamsBase = React.useMemo(() => {
    const { page: _p, pageSize: _s, ...rest } = listExtra
    void _p
    void _s
    return rest
  }, [listExtra])

  const ttkListExtra = React.useMemo(
    () =>
      buildTtkListFilterExtra({
        search: '',
        selectedDealers: debouncedDealers,
        dateRange,
        selectedType,
        selectedEmployeeId: null,
        scopeUser: toPayrollScopeUser(user),
        todayLiveStatus:
          selectedTodayLiveStatus !== TODAY_LIVE_STATUS_ALL
            ? selectedTodayLiveStatus
            : undefined,
      }),
    [debouncedDealers, dateRange, selectedType, selectedTodayLiveStatus, user],
  )

  const buildExportLabels = React.useCallback((): PunchGroupedExportLabels => {
    return {
      employee: t('common.employee'),
      roleDept: t('punch.roleDept'),
      date: t('common.date'),
      punchIn: t('punch.punchIn'),
      breakStart: t('punch.breakStart'),
      breakEnd: t('punch.breakEnd'),
      punchOut: t('punch.punchOut'),
      timeWork: t('punch.timeWork'),
      timeBreak: t('punch.timeBreak'),
      paymentType: t('punch.paymentType'),
      dealer: t('profile.dealer'),
      hasError: t('punch.withErrors'),
      yes: t('punch.exportYes'),
      no: t('punch.exportNo'),
      groupedSheet: t('punch.exportGroupedSheetName'),
      totalHours: t('punch.totalHours'),
      exportingProgress: t('punch.exportGroupedGenerating'),
      exportSheetSubtitle: t('punch.exportSheetSubtitle'),
      exportDetailSheetTitle: t('punch.exportDetailSheetTitle'),
    }
  }, [t])

  React.useEffect(() => {
    setPageIndex(0)
    setRowSelection({})
  }, [
    debouncedEmployeeSearch,
    debouncedDealers,
    selectedType,
    dateRange,
    minHoursTotal,
    maxHoursTotal,
    paymentTypeFilter,
    selectedEmployee?.id,
  ])

  const columns = React.useMemo<ColumnDef<PunchGroupedRow>[]>(
    () => [
      {
        id: 'select',
        size: 40,
        minSize: 40,
        maxSize: 44,
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected()
                ? true
                : table.getIsSomePageRowsSelected()
                  ? 'indeterminate'
                  : false
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label={t('punch.selectAllOnPage')}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label={t('punch.selectEmployee')}
            onClick={(e) => e.stopPropagation()}
          />
        ),
        meta: {
          label: t('punch.selectEmployee'),
          pin: 'left',
          headerClassName: 'w-[40px] px-2',
          cellClassName: 'px-2',
        } satisfies DataTableColumnMeta<PunchGroupedRow>,
      },
      {
        id: 'expand',
        size: 40,
        minSize: 40,
        maxSize: 44,
        enableSorting: false,
        enableHiding: false,
        header: () => <span className="sr-only">{t('punch.expandPunches')}</span>,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              row.toggleExpanded()
            }}
            aria-expanded={row.getIsExpanded()}
            aria-label={
              row.getIsExpanded() ? t('punch.collapsePunches') : t('punch.expandPunches')
            }
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {row.getIsExpanded() ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ),
        meta: {
          label: t('punch.expandPunches'),
          headerClassName: 'w-[40px] px-2',
          cellClassName: 'px-2',
        } satisfies DataTableColumnMeta<PunchGroupedRow>,
      },
      {
        id: 'employee',
        accessorFn: (row) => row.nombreEmployee,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('common.employee')} />
        ),
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  row.toggleExpanded()
                }}
                className="min-w-0 truncate text-left font-medium hover:underline"
              >
                {r.nombreEmployee}
              </button>
              {r.errorSummary ? (
                <span
                  className="shrink-0"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <PunchErrorIndicator errorText={r.errorSummary} />
                </span>
              ) : null}
            </div>
          )
        },
        meta: {
          label: t('common.employee'),
          sortKey: 'nombreEmployee',
          exportValue: (r) => r.nombreEmployee,
        } satisfies DataTableColumnMeta<PunchGroupedRow>,
      },
      {
        id: 'hoursNumber',
        accessorFn: (row) => row.hoursNumber,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('punch.totalHours')} />
        ),
        cell: ({ row }) => (
          <span className="font-mono font-semibold tabular-nums">
            {formatGroupedHoursDisplay(row.original.hoursNumber, useHoursFormat)}
          </span>
        ),
        meta: {
          label: t('punch.totalHours'),
          sortKey: 'hoursNumber',
          mono: true,
          exportValue: (r) => String(r.hoursNumber),
        } satisfies DataTableColumnMeta<PunchGroupedRow>,
      },
      {
        id: 'breakNumber',
        accessorFn: (row) => row.breakNumber,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('punch.timeBreak')} />
        ),
        cell: ({ row }) => (
          <span className="font-mono tabular-nums text-muted-foreground">
            {formatGroupedHoursDisplay(row.original.breakNumber, useHoursFormat)}
          </span>
        ),
        meta: {
          label: t('punch.timeBreak'),
          sortKey: 'breakNumber',
          mono: true,
          exportValue: (r) => String(r.breakNumber),
        } satisfies DataTableColumnMeta<PunchGroupedRow>,
      },
      {
        id: 'hasError',
        accessorFn: (row) => row.hasError,
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('punch.withErrors')} />
        ),
        cell: ({ row }) => {
          const r = row.original
          if (!r.hasError) {
            return <span className="text-xs text-muted-foreground">{t('punch.exportNo')}</span>
          }
          if (r.errorSummary) {
            return (
              <span onClick={(e) => e.stopPropagation()}>
                <PunchErrorIndicator errorText={r.errorSummary} />
              </span>
            )
          }
          return <span className="text-xs">{t('punch.exportYes')}</span>
        },
        meta: {
          label: t('punch.withErrors'),
          exportValue: (r) => (r.hasError ? t('punch.exportYes') : t('punch.exportNo')),
        } satisfies DataTableColumnMeta<PunchGroupedRow>,
      },
    ],
    [t, useHoursFormat],
  )

  const { rows, total, pageCount, isFetching, error } = useDataTableQuery({
    adapter: groupedAdapter,
    queryKey: [
      'punch-grouped',
      debouncedDealers.slice().sort().join(','),
      dateRange?.from?.toISOString(),
      dateRange?.to?.toISOString(),
      selectedType,
      debouncedEmployeeSearch,
      pageIndex,
      pageSize,
      sorting,
      minHoursTotal,
      maxHoursTotal,
      paymentTypeFilter,
      selectedEmployee?.id,
    ],
    queryFn: async () => fetchPunchGrouped(listExtra),
    enabled: queryEnabled,
    staleTime: 2 * 60 * 1000,
    pageIndex,
    pageSize,
    sorting,
    columnFilters: [],
    columns,
    extra: {},
  })

  const paymentTypeLabels = React.useMemo(() => {
    const labels = new Set<string>()
    for (const row of rows) {
      for (const pt of row.byPaymentType) {
        labels.add(pt.label)
      }
    }
    return Array.from(labels).sort((a, b) => a.localeCompare(b))
  }, [rows])

  const columnsWithPaymentTypes = React.useMemo<ColumnDef<PunchGroupedRow>[]>(() => {
    const paymentCols: ColumnDef<PunchGroupedRow>[] = paymentTypeLabels.map((label) => ({
      id: `pt-${label}`,
      accessorFn: (row) => paymentTypeHours(row, label),
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title={label} />,
      cell: ({ row }) => {
        const hours = paymentTypeHours(row.original, label)
        return (
          <span className="font-mono tabular-nums text-xs">
            {hours != null ? formatGroupedHoursDisplay(hours, useHoursFormat) : '—'}
          </span>
        )
      },
      meta: {
        label,
        mono: true,
        exportValue: (r) => {
          const h = paymentTypeHours(r, label)
          return h != null ? String(h) : ''
        },
      } satisfies DataTableColumnMeta<PunchGroupedRow>,
    }))
    return [...columns, ...paymentCols]
  }, [columns, paymentTypeLabels, useHoursFormat])

  const emptyState = !filtersHydrated ? (
    <span className="text-xs text-muted-foreground">{t('common.loading')}</span>
  ) : selectedDealers.length === 0 ? (
    <span className="text-xs text-muted-foreground">{t('punch.loadFiltersFirst')}</span>
  ) : (
    <div className="flex flex-col items-center gap-2 text-muted-foreground">
      <AlertTriangle className="h-8 w-8 opacity-20" />
      <span className="text-xs">{t('punch.noRecordsForFilters')}</span>
    </div>
  )

  const selectedEmployeeIds = React.useMemo(
    () =>
      Object.entries(rowSelection)
        .filter(([, selected]) => selected)
        .map(([id]) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
    [rowSelection],
  )

  const renderSubComponent = React.useCallback(
    (row: Row<PunchGroupedRow>) => (
      <GroupedPunchDetail row={row.original} useHoursFormat={useHoursFormat} />
    ),
    [useHoursFormat],
  )

  return (
    <div className="space-y-4">
      {(minHoursTotal != null || maxHoursTotal != null) && (
        <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
          {t('punch.groupedHoursHint')}
        </p>
      )}

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      <DataTable<PunchGroupedRow>
        tableId="issues-grouped"
        columns={columnsWithPaymentTypes}
        data={rows}
        getRowId={(row) => String(row.idUsuario)}
        isLoading={isFetching}
        emptyState={emptyState}
        enableGlobalFilter
        globalFilter={employeeSearch}
        onGlobalFilterChange={setEmployeeSearch}
        globalFilterPlaceholder={t('punch.searchEmployeeByName')}
        manualFiltering
        enableExport={false}
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        manualSorting
        sorting={sorting}
        onSortingChange={(next) => {
          setSorting(next)
          setPageIndex(0)
        }}
        pagination={{
          pageIndex,
          pageSize,
          pageCount,
          totalRows: total,
          onPaginationChange: (next) => {
            setPageIndex(next.pageIndex)
            setPageSize(next.pageSize)
          },
        }}
        toolbarLeading={
          selectedEmployeeIds.length > 0 ? (
            <Badge variant="secondary" className="h-6 text-[10px] font-medium">
              {t('punch.exportSelectedCount', { count: selectedEmployeeIds.length })}
            </Badge>
          ) : null
        }
        toolbarTrailing={
          <>
            <div className="flex items-center gap-2">
              <Label
                htmlFor="grouped-hours-format"
                className="cursor-pointer text-[11px] text-muted-foreground"
              >
                {useHoursFormat ? t('punch.hoursFormatHrs') : t('punch.hoursFormatDecimal')}
              </Label>
              <Switch
                id="grouped-hours-format"
                checked={useHoursFormat}
                onCheckedChange={handleHoursFormatChange}
                aria-label={t('punch.hoursFormat')}
              />
            </div>
            <GroupedPunchExportButton
              disabled={!queryEnabled || rows.length === 0}
              fileName="punch-grouped"
              groupedParamsBase={groupedParamsBase}
              ttkListExtra={ttkListExtra}
              includePaymentType={canViewPayment}
              buildLabels={buildExportLabels}
              selectedEmployeeIds={selectedEmployeeIds}
            />
          </>
        }
        renderSubComponent={renderSubComponent}
        subComponentLayout="full"
      />
    </div>
  )
}
