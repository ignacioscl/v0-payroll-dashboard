'use client'

import * as React from 'react'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import {
  DataTable,
  DataTableColumnHeader,
  type DataTableColumnMeta,
} from '@/components/shared/data-table'
import { RemovedDealerBadge } from '@/components/filters/removed-dealer-badge'
import { useIsMobile } from '@/hooks/use-mobile'
import { useTranslation } from '@/lib/i18n/locale-context'
import { cn } from '@/lib/utils'
import type { ProductionDealerRow } from '@/lib/srs-kpis-api'
import { fmtMoney } from '@/lib/kpi-money'

function AttainmentBadge({ pct }: { pct: number }) {
  const cls =
    pct >= 100
      ? 'bg-success/10 text-success'
      : pct >= 90
        ? 'bg-warning/15 text-amber-600'
        : 'bg-destructive/10 text-destructive'
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
        cls,
      )}
    >
      {pct.toFixed(1)}%
    </span>
  )
}

type ProductionDealerTableProps = {
  data?: ProductionDealerRow[]
  loading?: boolean
  /** «Include removed dealers» on: these rows show «Removed» and export «(removed)» (§5). */
  removedIds?: ReadonlySet<number>
}

export function ProductionDealerTable({ data, loading, removedIds }: ProductionDealerTableProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const columnPinning = React.useMemo(
    () => (isMobile ? { left: [], right: [] } : { left: ['dealer'] }),
    [isMobile],
  )
  const rows = data ?? []
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'attainmentPct', desc: true },
  ])

  const columns = React.useMemo<ColumnDef<ProductionDealerRow>[]>(
    () => [
      {
        accessorKey: 'dealer',
        size: 220,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('dealer.label')} />
        ),
        cell: ({ row }) =>
          // On a phone the whole name wraps instead of «…» (rule data-table).
          removedIds?.has(row.original.dealerId) ? (
            <span className={cn('flex min-w-0 gap-2', isMobile ? 'flex-wrap items-start' : 'items-center')}>
              <span className={cn('font-medium', isMobile ? 'whitespace-normal break-words' : 'truncate')}>
                {row.original.dealer}
              </span>
              <RemovedDealerBadge />
            </span>
          ) : (
            <span className={cn('block font-medium', isMobile ? 'whitespace-normal break-words' : 'truncate')}>
              {row.original.dealer}
            </span>
          ),
        meta: {
          label: t('dealer.label'),
          // No fixed columns on a phone: they cover the others (rule data-table).
          pin: isMobile ? undefined : 'left',
          exportValue: (row) =>
            removedIds?.has(row.dealerId)
              ? `${row.dealer} ${t('businessKpis.removedDealerSuffix')}`
              : row.dealer,
        } satisfies DataTableColumnMeta<ProductionDealerRow>,
      },
      {
        accessorKey: 'wos',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('mockKpis.tableWosDone')} />
        ),
        cell: ({ row }) => row.original.wos.toLocaleString(),
        meta: {
          label: t('mockKpis.tableWosDone'),
          numeric: true,
          exportValue: (row) => row.wos,
        } satisfies DataTableColumnMeta<ProductionDealerRow>,
      },
      {
        accessorKey: 'value',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('mockKpis.tableProductionValue')} />
        ),
        cell: ({ row }) => fmtMoney(row.original.value),
        meta: {
          label: t('mockKpis.tableProductionValue'),
          numeric: true,
          money: true,
          exportValue: (row) => row.value,
        } satisfies DataTableColumnMeta<ProductionDealerRow>,
      },
      {
        accessorKey: 'goal',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('mockKpis.tableGoal')} />
        ),
        cell: ({ row }) =>
          row.original.goal > 0 ? (
            fmtMoney(row.original.goal)
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        meta: {
          label: t('mockKpis.tableGoal'),
          numeric: true,
          money: true,
          exportValue: (row) => (row.goal > 0 ? row.goal : null),
        } satisfies DataTableColumnMeta<ProductionDealerRow>,
      },
      {
        accessorKey: 'attainmentPct',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('mockKpis.tableAttainment')} />
        ),
        cell: ({ row }) =>
          row.original.goal > 0 ? (
            <AttainmentBadge pct={row.original.attainmentPct} />
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        meta: {
          label: t('mockKpis.tableAttainmentPct'),
          numeric: true,
          exportValue: (row) => (row.goal > 0 ? row.attainmentPct : null),
        } satisfies DataTableColumnMeta<ProductionDealerRow>,
      },
    ],
    [t, removedIds, isMobile],
  )

  return (
    <DataTable<ProductionDealerRow>
      tableId="kpi-production-by-dealer"
      columns={columns}
      data={rows}
      getRowId={(row) => row.dealer}
      isLoading={loading}
      sorting={sorting}
      onSortingChange={setSorting}
      columnPinning={columnPinning}
      defaultPageSize={25}
      includeAllPageSize
      enableGlobalFilter={false}
      enableExport
      exportFileName="kpi-production-by-dealer"
      toolbarLeading={
        <span className="text-base font-semibold">{t('mockKpis.chartProductionVsGoal')}</span>
      }
      emptyState={
        <p className="py-8 text-center text-sm text-muted-foreground">—</p>
      }
    />
  )
}
