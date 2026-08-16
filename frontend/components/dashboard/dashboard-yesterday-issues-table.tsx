'use client'

import * as React from 'react'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { enUS, es } from 'date-fns/locale'
import {
  DataTable,
  createTtkListAdapter,
  useDataTableQuery,
  type DataTableColumnMeta,
} from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { useFilters } from '@/lib/filter-context'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { throwIfSrsFail } from '@/lib/srs/parse-srs-response'
import { getYesterdayOnlyDateRange } from '@/lib/filters/date-range-presets'
import { buildTtkListFilterExtra, formatGmtDate, toPayrollScopeUser } from '@/lib/ttk/map-header-filters'
import type { TtkListResponse, TtkListRow } from '@/lib/ttk/ttk-list-types'
import { SrsPhpPath } from '@/types/enum-url'
import { useTranslation } from '@/lib/i18n/locale-context'
import { useSrsMe } from '@/lib/auth/use-srs-me'

const ttkListAdapter = createTtkListAdapter<TtkListRow>(mapTtkOrderBy)

function mapTtkOrderBy(): string {
  return 'tew.punch_in DESC'
}

/** Dashboard widget: yesterday punch issues — slim columns, DataTable shell. */
export function DashboardYesterdayIssuesTable() {
  const { t, locale } = useTranslation()
  const { user } = useSrsMe()
  const scopeUser = toPayrollScopeUser(user)
  const dateFnsLocale = locale === 'es' ? es : enUS
  const { selectedDealers, filtersHydrated } = useFilters()
  const debouncedDealers = useDebouncedValue(selectedDealers, 450)
  const yesterdayRange = React.useMemo(() => getYesterdayOnlyDateRange(), [])
  const yesterdayLabel = React.useMemo(() => {
    const day = yesterdayRange.from ?? yesterdayRange.to
    return day
      ? format(day, 'EEEE, MMM d, yyyy', { locale: dateFnsLocale })
      : t('common.yesterday')
  }, [yesterdayRange, dateFnsLocale, t])

  const [pageIndex, setPageIndex] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(8)
  const [sorting] = React.useState<SortingState>([{ id: 'date', desc: true }])

  const issueLabel = React.useCallback(
    (row: TtkListRow): string => {
      const res = row.badPunch?.res?.trim()
      return res || t('common.validationError')
    },
    [t],
  )

  const columns: ColumnDef<TtkListRow>[] = React.useMemo(
    () => [
      {
        id: 'employee',
        accessorFn: (row) => row.usuario?.nombre ?? '',
        header: t('common.employee'),
        cell: ({ row }) => (
          <span className="text-sm font-medium text-foreground">
            {row.original.usuario?.nombre ?? '—'}
          </span>
        ),
        meta: {
          label: t('common.employee'),
          exportValue: (r) => r.usuario?.nombre ?? '',
        } satisfies DataTableColumnMeta<TtkListRow>,
      },
      {
        id: 'dealer',
        accessorFn: (row) => row.dealer?.razonSocial ?? '',
        header: t('dealer.label'),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.dealer?.razonSocial ?? '—'}
          </span>
        ),
        meta: {
          label: t('dealer.label'),
          exportValue: (r) => r.dealer?.razonSocial ?? '',
        } satisfies DataTableColumnMeta<TtkListRow>,
      },
      {
        id: 'date',
        accessorFn: (row) => row.punchInGmt0 ?? '',
        header: t('common.date'),
        cell: ({ row }) => formatGmtDate(row.original.punchInGmt0) || '—',
        meta: {
          label: t('common.date'),
          exportValue: (r) => formatGmtDate(r.punchInGmt0),
        } satisfies DataTableColumnMeta<TtkListRow>,
      },
      {
        id: 'issue',
        accessorFn: (row) => issueLabel(row),
        header: t('punch.issues'),
        cell: ({ row }) => (
          <Badge variant="outline" className="max-w-[220px] truncate text-xs font-normal">
            {issueLabel(row.original)}
          </Badge>
        ),
        meta: {
          label: t('punch.issues'),
          exportValue: (r) => issueLabel(r),
        } satisfies DataTableColumnMeta<TtkListRow>,
      },
      {
        id: 'status',
        accessorFn: (row) => (row.fixedAt ? t('common.corrected') : t('common.open')),
        header: t('common.status'),
        cell: ({ row }) =>
          row.original.fixedAt ? (
            <Badge variant="secondary" className="text-xs">
              {t('common.corrected')}
            </Badge>
          ) : (
            <Badge variant="destructive" className="text-xs">
              {t('common.open')}
            </Badge>
          ),
        meta: {
          label: t('common.status'),
          exportValue: (r) => (r.fixedAt ? t('common.corrected') : t('common.open')),
        } satisfies DataTableColumnMeta<TtkListRow>,
      },
    ],
    [issueLabel, t],
  )

  const apiRequest = useSrsApiRequest<
    unknown,
    Record<string, string | number>,
    TtkListResponse
  >(SrsPhpPath.TTK_LIST)

  const listExtra = React.useMemo(
    () =>
      buildTtkListFilterExtra({
        search: '',
        selectedDealers: debouncedDealers,
        dateRange: yesterdayRange,
        selectedType: 'only_error',
        scopeUser,
      }),
    [debouncedDealers, yesterdayRange, scopeUser],
  )

  const queryEnabled =
    filtersHydrated &&
    debouncedDealers.length > 0 &&
    Boolean(listExtra.fecha_desde) &&
    Boolean(listExtra.fecha_hasta)

  const { rows, total, pageCount, isFetching, error } = useDataTableQuery({
    adapter: ttkListAdapter,
    queryKey: [
      'ttk-list',
      'dashboard-yesterday',
      debouncedDealers.slice().sort().join(','),
      yesterdayRange.from?.toISOString(),
    ],
    queryFn: async (params) => {
      const data = await apiRequest.getCustom('', undefined, params)
      throwIfSrsFail(data, t('dashboard.yesterdayLoadFailed'))
      return data as TtkListResponse
    },
    enabled: queryEnabled,
    staleTime: 2 * 60 * 1000,
    pageIndex,
    pageSize,
    sorting,
    columnFilters: [],
    columns,
    extra: listExtra,
  })

  const emptyState = !filtersHydrated ? (
    <span className="text-xs text-muted-foreground">{t('common.loading')}</span>
  ) : selectedDealers.length === 0 ? (
    <span className="text-xs text-muted-foreground">{t('punch.loadFiltersFirst')}</span>
  ) : (
    <div className="flex flex-col items-center gap-2 text-muted-foreground">
      <AlertTriangle className="h-8 w-8 opacity-20" />
      <span className="text-xs">{t('common.noDataToDisplay')}</span>
    </div>
  )

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {t('dashboard.yesterdayTableNote', { date: yesterdayLabel })}
      </p>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      <DataTable<TtkListRow>
        tableId="dashboard-yesterday-issues"
        columns={columns}
        data={rows}
        getRowId={(row) => String(row.id)}
        isLoading={isFetching}
        emptyState={emptyState}
        enableGlobalFilter={false}
        enableViewOptions={false}
        enableExport={false}
        enableColumnResizing={false}
        manualSorting
        sorting={sorting}
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
        defaultPageSize={8}
        pageSizeOptions={[8, 10, 25]}
        density="compact"
        headerVariant="subtle"
        stickyHeader={false}
      />
    </div>
  )
}
