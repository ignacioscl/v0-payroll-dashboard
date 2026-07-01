'use client'

import * as React from 'react'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import {
  DataTable,
  DataTableColumnHeader,
  type DataTableColumnMeta,
} from '@/components/shared/data-table'
import { useTranslation } from '@/lib/i18n/locale-context'
import { cn } from '@/lib/utils'
import { UNBILLED_LOOKBACK_MONTHS, type UnbilledDealerRow } from '@/lib/srs-kpis-api'

const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString()}`

type UnbilledByDealerTableProps = {
  data?: UnbilledDealerRow[]
  loading?: boolean
}

export function UnbilledByDealerTable({ data, loading }: UnbilledByDealerTableProps) {
  const { t } = useTranslation()
  const rows = data ?? []
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'value', desc: true }])

  const columns = React.useMemo<ColumnDef<UnbilledDealerRow>[]>(
    () => [
      {
        accessorKey: 'dealer',
        size: 220,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('dealer.label')} />
        ),
        cell: ({ row }) => (
          <span className="block truncate font-medium">{row.original.dealer}</span>
        ),
        meta: {
          label: t('dealer.label'),
          pin: 'left',
        } satisfies DataTableColumnMeta<UnbilledDealerRow>,
      },
      {
        accessorKey: 'wos',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('mockKpis.tableUnbilledWos')} />
        ),
        cell: ({ row }) => row.original.wos.toLocaleString(),
        meta: {
          label: t('mockKpis.tableUnbilledWos'),
          numeric: true,
          exportValue: (row) => row.wos,
        } satisfies DataTableColumnMeta<UnbilledDealerRow>,
      },
      {
        accessorKey: 'value',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('mockKpis.tableUnbilledValue')} />
        ),
        cell: ({ row }) => fmtMoney(row.original.value),
        meta: {
          label: t('mockKpis.tableUnbilledValue'),
          numeric: true,
          exportValue: (row) => row.value,
        } satisfies DataTableColumnMeta<UnbilledDealerRow>,
      },
      {
        accessorKey: 'oldestDays',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('mockKpis.tableOldestDays')} />
        ),
        cell: ({ row }) => (
          <span
            className={cn(
              'tabular-nums font-semibold',
              row.original.oldestDays > 30
                ? 'text-destructive'
                : row.original.oldestDays > 14
                  ? 'text-amber-600'
                  : 'text-muted-foreground',
            )}
          >
            {row.original.oldestDays}
          </span>
        ),
        meta: {
          label: t('mockKpis.tableOldestDays'),
          numeric: true,
          exportValue: (row) => row.oldestDays,
        } satisfies DataTableColumnMeta<UnbilledDealerRow>,
      },
    ],
    [t],
  )

  return (
    <DataTable<UnbilledDealerRow>
      tableId="kpi-unbilled-by-dealer"
      columns={columns}
      data={rows}
      getRowId={(row) => row.dealer}
      isLoading={loading}
      sorting={sorting}
      onSortingChange={setSorting}
      columnPinning={{ left: ['dealer'] }}
      defaultPageSize={25}
      includeAllPageSize
      enableExport
      exportFileName="kpi-unbilled-by-dealer"
      globalFilterPlaceholder={t('dealer.label')}
      toolbarLeading={
        <div className="flex flex-col">
          <span className="text-base font-semibold">{t('mockKpis.chartUnbilledByDealer')}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {t('mockKpis.unbilledLookbackNote', { months: UNBILLED_LOOKBACK_MONTHS })}
          </span>
        </div>
      }
      emptyState={<p className="py-8 text-center text-sm text-muted-foreground">—</p>}
    />
  )
}
