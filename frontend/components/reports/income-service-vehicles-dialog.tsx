'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { X } from 'lucide-react'
import { DataTable, DataTableColumnHeader, type DataTableColumnMeta } from '@/components/shared/data-table'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatUsCalendarDate } from '@/lib/format-us-datetime'
import { useTranslation } from '@/lib/i18n/locale-context'
import { fmtMoney, fmtQty } from '@/lib/kpi-money'
import { isSrsBusyError } from '@/lib/srs-busy-error'
import type { IncomeServiceVehicle } from '@/lib/srs-kpis-api'
import { useServiceVehicles, type ServiceVehiclesTarget } from './income-service-vehicles-query'

/** Text that wraps on mobile (rule of tables on mobile: nothing cut with «…»). */
function textColumn(key: 'make' | 'model', title: string, size: number): ColumnDef<IncomeServiceVehicle> {
  return {
    accessorKey: key,
    size,
    header: ({ column }) => <DataTableColumnHeader column={column} title={title} />,
    cell: ({ row }) => <span className="whitespace-normal break-words">{row.original[key]}</span>,
    meta: { label: title } satisfies DataTableColumnMeta<IncomeServiceVehicle>,
  }
}

/**
 * «View in a window»: every vehicle of one service of the open dealer row, with search, paging and the total of the row
 * (plans/plan-income-by-dealer-ttk-y-autos §5.2 and T5). Same shape as the Monthly Closing dealer dialog
 * (`monthly-closing-dealer-dialog.tsx`). No Export (D4): the list is in the Vehicles sheet of «By dealer and service».
 */
export function IncomeServiceVehiclesDialog({
  target,
  yearLabel,
  onClose,
}: {
  /** The service and the row it comes from; `null` = closed. */
  target: ServiceVehiclesTarget | null
  /** «2026» or «2026 YTD», as the table of the year says. */
  yearLabel: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const query = useServiceVehicles(target)

  const columns = React.useMemo<ColumnDef<IncomeServiceVehicle>[]>(
    () => [
      {
        accessorKey: 'vin',
        size: 190,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('incomeByDealer.colVin')} />,
        cell: ({ row }) => <span className="whitespace-nowrap font-mono">{row.original.vin}</span>,
        meta: { label: t('incomeByDealer.colVin') } satisfies DataTableColumnMeta<IncomeServiceVehicle>,
      },
      textColumn('make', t('incomeByDealer.colMake'), 130),
      textColumn('model', t('incomeByDealer.colModel'), 220),
      {
        accessorKey: 'carYear',
        size: 70,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('incomeByDealer.colYear')} />,
        cell: ({ row }) => <span className="tabular-nums">{row.original.carYear ?? ''}</span>,
        meta: { label: t('incomeByDealer.colYear') } satisfies DataTableColumnMeta<IncomeServiceVehicle>,
      },
      {
        // A string, not the array: the search of the DataTable only looks at text and numbers.
        id: 'wos',
        accessorFn: (r) => r.wos.join(', '),
        size: 150,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('invoices.colWo')} />,
        cell: ({ row }) => <span className="whitespace-normal break-words">{row.original.wos.join(', ')}</span>,
        meta: { label: t('invoices.colWo') } satisfies DataTableColumnMeta<IncomeServiceVehicle>,
      },
      {
        // The date of each WO, in the order of WO #: the one the report uses for the period (creation, or Done with
        // «Filter by completion date»). Sorted by the YYYY-MM-DD text, so the order is by date.
        id: 'woDates',
        accessorFn: (r) => r.woDates.join(', '),
        size: 110,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.colDate')} />,
        cell: ({ row }) => (
          <span className="whitespace-normal break-words tabular-nums">
            {row.original.woDates.map((d) => formatUsCalendarDate(d)).join(', ')}
          </span>
        ),
        meta: { label: t('expenses.colDate') } satisfies DataTableColumnMeta<IncomeServiceVehicle>,
      },
      {
        accessorKey: 'qty',
        size: 70,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('incomeByDealer.colQty')} />,
        cell: ({ row }) => fmtQty(row.original.qty),
        meta: { label: t('incomeByDealer.colQty'), numeric: true } satisfies DataTableColumnMeta<IncomeServiceVehicle>,
      },
      {
        accessorKey: 'income',
        size: 120,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('incomeByDealer.colIncome')} />,
        cell: ({ row }) => fmtMoney(row.original.income),
        meta: { label: t('incomeByDealer.colIncome'), numeric: true } satisfies DataTableColumnMeta<IncomeServiceVehicle>,
      },
    ],
    [t],
  )

  const data = query.data
  return (
    <Dialog open={target != null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent
        className="flex max-h-[90dvh] flex-col gap-4 overflow-y-auto sm:max-w-[min(96vw,64rem)]"
        data-testid="income-service-vehicles-dialog"
      >
        <DialogHeader className="pr-8">
          <DialogTitle className="break-words">
            {target ? t('incomeByDealer.vehiclesTitle', { service: target.service, dealer: target.dealer }) : ''}
          </DialogTitle>
          <DialogDescription>
            {target
              ? `${yearLabel} · ${formatUsCalendarDate(target.fechaDesde)} – ${formatUsCalendarDate(target.fechaHasta)}`
              : ''}
          </DialogDescription>
          {target ? (
            <p className="text-sm tabular-nums text-muted-foreground">
              {t('incomeByDealer.vehiclesNumbers', {
                qty: fmtQty(target.qty),
                vehicles: fmtQty(target.vehicles),
                income: fmtMoney(target.income),
              })}
            </p>
          ) : null}
        </DialogHeader>

        {query.isError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {isSrsBusyError(query.error) ? t('common.serverBusy') : t('common.failedToLoad')}
          </div>
        ) : null}

        <DataTable<IncomeServiceVehicle>
          tableId="income-service-vehicles"
          columns={columns}
          data={data?.rows ?? []}
          getRowId={(r) => r.vin}
          isLoading={query.isFetching}
          includeAllPageSize
          tableScrollHeight="50vh"
          enableViewOptions={false}
          globalFilterPlaceholder={t('incomeByDealer.vehiclesSearch')}
          emptyState={<p className="py-8 text-center text-sm text-muted-foreground">{t('incomeByDealer.vehiclesEmpty')}</p>}
          footer={
            data && data.rows.length > 0 ? (
              <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-sm font-semibold">
                <span>{t('incomeByDealer.total')}</span>
                <span className="tabular-nums">{fmtMoney(data.income)}</span>
              </div>
            ) : undefined
          }
        />

        <DialogFooter>
          <Button type="button" variant="outline" className="cursor-pointer" onClick={onClose}>
            <X className="size-4" />
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
