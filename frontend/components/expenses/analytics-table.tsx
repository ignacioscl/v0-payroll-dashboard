'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { PieChart } from 'lucide-react'

import { RemovedDealerBadge } from '@/components/filters/removed-dealer-badge'
import { DataTable, DataTableColumnHeader, type DataTableColumnMeta } from '@/components/shared/data-table'
import { ServerXlsxExportButton } from '@/components/shared/server-xlsx-export-button'
import { useIsMobile } from '@/hooks/use-mobile'
import { fmtAmount } from '@/lib/expenses/expense-format'
import { toCents } from '@/lib/expenses/expense-rules'
import { useTranslation } from '@/lib/i18n/locale-context'
import { analyticsExportUrl, type AnalyticsParams, type AnalyticsResponse, type AnalyticsRow } from '@/lib/srs-expenses-api'
import { cn } from '@/lib/utils'

function pct(part: string, total: string): number | null {
  const tot = toCents(total)
  if (tot <= 0) return null
  return (toCents(part) / tot) * 100
}

function diff(cur: string, prev: string): { amount: number; pct: number | null } {
  const c = toCents(cur)
  const p = toCents(prev)
  return { amount: (c - p) / 100, pct: p > 0 ? ((c - p) / p) * 100 : null }
}

/** Una solapa de Analytics (F5): nombre, Expenses, Total, % of total y vs. previous period, con export. */
export function AnalyticsTable({
  params,
  data,
  loading,
  removedIds,
}: {
  params: AnalyticsParams | null
  data?: AnalyticsResponse
  loading: boolean
  removedIds?: ReadonlySet<number>
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const isMobile = useIsMobile()
  const columnPinning = React.useMemo(() => ({ left: [], right: [] }), [])
  const wrap = isMobile ? 'whitespace-normal break-words' : 'truncate'
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'total', desc: true }])
  const rows = React.useMemo(() => data?.rows ?? [], [data])
  const total = data?.total ?? '0'
  const groupBy = params?.groupBy ?? 'category'

  const nameLabel =
    groupBy === 'category' ? t('expenses.tabCategory') : groupBy === 'company' ? t('expenses.tabCompany') : t('expenses.tabBranch')

  const columns = React.useMemo<ColumnDef<AnalyticsRow>[]>(
    () => [
      {
        accessorKey: 'name',
        size: 240,
        header: ({ column }) => <DataTableColumnHeader column={column} title={nameLabel} />,
        cell: ({ row }) => (
          <span className={cn('flex min-w-0 items-center gap-2 font-medium', wrap)}>
            <span className={wrap}>{row.original.name}</span>
            {row.original.removed || removedIds?.has(row.original.id) ? <RemovedDealerBadge /> : null}
          </span>
        ),
        meta: { label: nameLabel } satisfies DataTableColumnMeta<AnalyticsRow>,
      },
      {
        accessorKey: 'count',
        size: 100,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.expensesCount')} />,
        cell: ({ row }) => <span className="tabular-nums">{row.original.count.toLocaleString()}</span>,
        meta: { label: t('expenses.expensesCount'), numeric: true } satisfies DataTableColumnMeta<AnalyticsRow>,
      },
      {
        id: 'total',
        accessorFn: (r) => Number(r.total),
        size: 130,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.total')} />,
        cell: ({ row }) => <span className="font-medium tabular-nums">{fmtAmount(row.original.total)}</span>,
        meta: { label: t('expenses.total'), numeric: true, money: true } satisfies DataTableColumnMeta<AnalyticsRow>,
      },
      {
        id: 'pctOfTotal',
        accessorFn: (r) => pct(r.total, total) ?? 0,
        size: 100,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.pctOfTotal')} />,
        cell: ({ row }) => {
          const v = pct(row.original.total, total)
          return <span className="tabular-nums">{v === null ? '—' : `${v.toFixed(1)}%`}</span>
        },
        meta: { label: t('expenses.pctOfTotal'), numeric: true } satisfies DataTableColumnMeta<AnalyticsRow>,
      },
      {
        id: 'vsPrevious',
        accessorFn: (r) => diff(r.total, r.prevTotal).amount,
        size: 170,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.vsPrevious')} />,
        cell: ({ row }) => {
          const d = diff(row.original.total, row.original.prevTotal)
          const tone = d.amount > 0 ? 'text-destructive' : d.amount < 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'
          return (
            <span className={cn('tabular-nums', tone)}>
              {d.amount > 0 ? '+' : ''}
              {fmtAmount(d.amount.toFixed(2))}
              {d.pct !== null ? ` (${d.pct > 0 ? '+' : ''}${d.pct.toFixed(1)}%)` : ''}
            </span>
          )
        },
        meta: { label: t('expenses.vsPrevious'), numeric: true } satisfies DataTableColumnMeta<AnalyticsRow>,
      },
    ],
    [t, nameLabel, wrap, total, removedIds],
  )

  const onRowClick = (row: AnalyticsRow) => {
    if (!params) return
    const q = new URLSearchParams({ from: params.from, to: params.to, name: row.name })
    if (groupBy === 'category') q.set('idCategory', String(row.id))
    else if (groupBy === 'company') q.set('idCompany', String(row.id))
    else q.set('idDealer', String(row.id))
    router.push(`/expenses?${q.toString()}`)
  }

  return (
    <DataTable<AnalyticsRow>
      tableId={`expenses.analytics.${groupBy}.v1`}
      columns={columns}
      data={rows}
      isLoading={loading}
      getRowId={(r) => String(r.id)}
      columnPinning={columnPinning}
      sorting={sorting}
      onSortingChange={setSorting}
      onRowClick={onRowClick}
      defaultPageSize={25}
      includeAllPageSize
      enableGlobalFilter={false}
      enableExport={false}
      exportAction={
        <ServerXlsxExportButton
          url={params ? analyticsExportUrl(params) : null}
          rowCount={rows.length}
          fallbackFileName={`expenses_by_${groupBy}.xlsx`}
          disabled={loading || rows.length === 0}
        />
      }
      density="compact"
      headerVariant="colored"
      emptyState={
        <div className="flex flex-col items-center gap-1 py-8 text-muted-foreground">
          <PieChart className="size-8 opacity-40" />
          <p className="text-sm">{t('expenses.emptyExpenses')}</p>
        </div>
      }
    />
  )
}
