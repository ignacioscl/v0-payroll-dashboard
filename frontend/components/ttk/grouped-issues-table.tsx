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
import type { PunchGroupedRow } from '@/lib/ttk/punch-grouped-types'
import type { PaymentTypeFilterValue } from '@/lib/ttk/payment-type-filter'
import { IssuesDataTable } from '@/components/ttk/issues-data-table'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from '@/lib/i18n/locale-context'

const groupedAdapter = createPaginatedAdapter<PunchGroupedRow>()

function formatHoursDecimal(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return `${value.toFixed(2)}h`
}

function GroupedPunchDetail({ row }: { row: PunchGroupedRow }) {
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
    <div className="w-full min-w-0 border-l-[3px] border-l-primary/40 bg-muted/20 px-4 py-3">
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
    search,
    selectedEmployee,
    selectedDealers,
    selectedType,
    dateRange,
    filtersHydrated,
  } = useFilters()

  const [pageIndex, setPageIndex] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(25)
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'hoursNumber', desc: true },
  ])

  const debouncedDealers = useDebouncedValue(selectedDealers, 450)
  const debouncedSearch = useDebouncedValue(search, 300)
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
        search: debouncedSearch,
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
      debouncedSearch,
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

  const columns = React.useMemo<ColumnDef<PunchGroupedRow>[]>(
    () => [
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
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                row.toggleExpanded()
              }}
              className="flex min-w-0 items-center gap-1.5 text-left hover:underline"
            >
              <span className="truncate font-medium">{r.nombreEmployee}</span>
              {r.hasError ? (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-orange-500" />
              ) : null}
            </button>
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
            {formatHoursDecimal(row.original.hoursNumber)}
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
            {formatHoursDecimal(row.original.breakNumber)}
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
        id: 'byPaymentType',
        accessorFn: (row) => row.byPaymentType.map((p) => p.label).join(', '),
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('punch.paymentType')} />
        ),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.byPaymentType.length === 0 ? (
              <span className="text-xs text-muted-foreground">—</span>
            ) : (
              row.original.byPaymentType.map((pt) => (
                <Badge key={`${pt.idPaymentType}-${pt.label}`} variant="secondary" className="text-[10px]">
                  {pt.label}: {formatHoursDecimal(pt.hoursNumber)}
                </Badge>
              ))
            )}
          </div>
        ),
        meta: {
          label: t('punch.paymentType'),
          exportValue: (r) =>
            r.byPaymentType.map((p) => `${p.label} ${p.hoursNumber}`).join('; '),
        } satisfies DataTableColumnMeta<PunchGroupedRow>,
      },
    ],
    [t],
  )

  React.useEffect(() => {
    setPageIndex(0)
  }, [
    debouncedSearch,
    debouncedDealers,
    selectedType,
    dateRange,
    minHoursTotal,
    maxHoursTotal,
    paymentTypeFilter,
    selectedEmployee?.id,
  ])

  const { rows, total, pageCount, isFetching, error } = useDataTableQuery({
    adapter: groupedAdapter,
    queryKey: [
      'punch-grouped',
      debouncedDealers.slice().sort().join(','),
      dateRange?.from?.toISOString(),
      dateRange?.to?.toISOString(),
      selectedType,
      debouncedSearch,
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

  const renderSubComponent = React.useCallback(
    (row: Row<PunchGroupedRow>) => <GroupedPunchDetail row={row.original} />,
    [],
  )

  return (
    <div className="space-y-4">
      {(minHoursTotal != null || maxHoursTotal != null) && (
        <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
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
        columns={columns}
        data={rows}
        getRowId={(row) => String(row.idUsuario)}
        isLoading={isFetching}
        emptyState={emptyState}
        enableGlobalFilter={false}
        enableExport
        exportFileName="punch-grouped"
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
        renderSubComponent={renderSubComponent}
        subComponentLayout="full"
      />
    </div>
  )
}
