'use client'

import * as React from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable, DataTableColumnHeader, type DataTableColumnMeta } from '@/components/shared/data-table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatUsCalendarDate } from '@/lib/format-us-datetime'
import { useTranslation } from '@/lib/i18n/locale-context'
import { fmtMoney } from '@/lib/kpi-money'
import { formatNyDateTime } from '@/lib/reports/open-invoices-dates'
import {
  fetchOpenInvoiceSnapshots,
  OPEN_INVOICE_SNAPSHOTS_QUERY_KEY,
  type OpenInvoiceSnapshotHeader,
} from '@/lib/srs-kpis-api'

/**
 * Los dealers de una foto: «All», el nombre si es uno, o el primero y la cantidad («AutoNation … (3)») con la lista
 * entera en el tooltip, para que una foto de muchos dealers no ocupe media pantalla. El Excel lleva la lista entera.
 */
export function SnapshotDealers({ snapshot }: { snapshot: Pick<OpenInvoiceSnapshotHeader, 'dealers' | 'dealerNames'> }) {
  const names = snapshot.dealerNames
  if (!names || names.length <= 1) return <span className="whitespace-normal break-words">{snapshot.dealers}</span>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default whitespace-normal break-words">
          {names[0]} <span className="text-muted-foreground">({names.length})</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{names.join(', ')}</TooltipContent>
    </Tooltip>
  )
}

/**
 * «Snapshots» de Open Invoices (plans/plan-reporte-javier §1.5, §4.3): las fotos que guardó cada Excel, la más nueva
 * arriba, en un modal con el `DataTable` paginado. «Compare with today» es el enlace de la fila (`rowLink`): lleva a
 * la comparación. Un usuario con dealers asignados ve solo lo de sus dealers (lo recorta Nest).
 */
export function OpenInvoiceSnapshotsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const [pageIndex, setPageIndex] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(25)

  const list = useQuery({
    queryKey: [...OPEN_INVOICE_SNAPSHOTS_QUERY_KEY, pageIndex, pageSize],
    queryFn: () => fetchOpenInvoiceSnapshots(pageIndex + 1, pageSize),
    enabled: open,
    placeholderData: keepPreviousData,
  })

  const columns = React.useMemo<ColumnDef<OpenInvoiceSnapshotHeader>[]>(
    () => [
      {
        accessorKey: 'generatedAt',
        size: 180,
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('openInvoices.generated')} />,
        cell: ({ row }) => (
          <span className="tabular-nums">
            #{row.original.id} · {formatNyDateTime(row.original.generatedAt)}
          </span>
        ),
        meta: { label: t('openInvoices.generated') } satisfies DataTableColumnMeta<OpenInvoiceSnapshotHeader>,
      },
      {
        accessorKey: 'generatedBy',
        size: 160,
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('openInvoices.by')} />,
        cell: ({ row }) => <span className="whitespace-normal break-words">{row.original.generatedBy}</span>,
        meta: { label: t('openInvoices.by') } satisfies DataTableColumnMeta<OpenInvoiceSnapshotHeader>,
      },
      {
        accessorKey: 'asOf',
        size: 110,
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('openInvoices.asOf')} />,
        cell: ({ row }) => <span className="tabular-nums">{formatUsCalendarDate(row.original.asOf)}</span>,
        meta: { label: t('openInvoices.asOf') } satisfies DataTableColumnMeta<OpenInvoiceSnapshotHeader>,
      },
      {
        accessorKey: 'dealers',
        size: 220,
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('dealer.labelPlural')} />,
        cell: ({ row }) => <SnapshotDealers snapshot={row.original} />,
        meta: { label: t('dealer.labelPlural') } satisfies DataTableColumnMeta<OpenInvoiceSnapshotHeader>,
      },
      {
        accessorKey: 'total',
        size: 130,
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('openInvoices.total')} />,
        cell: ({ row }) => fmtMoney(row.original.total),
        meta: { label: t('openInvoices.total'), numeric: true } satisfies DataTableColumnMeta<OpenInvoiceSnapshotHeader>,
      },
      {
        id: 'compare',
        size: 170,
        enableSorting: false,
        header: () => <span className="sr-only">{t('openInvoices.compareWithToday')}</span>,
        cell: () => <span className="font-medium text-primary">{t('openInvoices.compareWithToday')}</span>,
        meta: { label: t('openInvoices.compareWithToday') } satisfies DataTableColumnMeta<OpenInvoiceSnapshotHeader>,
      },
    ],
    [t],
  )

  const total = list.data?.total ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-4 overflow-y-auto sm:max-w-[min(96vw,64rem)]">
        <DialogHeader className="pr-8">
          <DialogTitle>{t('openInvoices.snapshots')}</DialogTitle>
          <DialogDescription>{t('openInvoices.title')}</DialogDescription>
        </DialogHeader>
        <div className="min-w-0">
          <DataTable<OpenInvoiceSnapshotHeader>
            tableId="open-invoice-snapshots"
            columns={columns}
            data={list.data?.results ?? []}
            getRowId={(row) => String(row.id)}
            isLoading={list.isFetching}
            pagination={{
              pageIndex,
              pageSize,
              pageCount: list.data ? Math.max(1, Math.ceil(total / pageSize)) : -1,
              totalRows: total,
              onPaginationChange: (next) => {
                setPageIndex(next.pageIndex)
                setPageSize(next.pageSize)
              },
            }}
            defaultPageSize={25}
            enableGlobalFilter={false}
            rowLink={(row) => ({ href: `/reports/open-invoices/snapshots/${row.id}`, onNavigate: () => onOpenChange(false) })}
            rowLinkColumnId="compare"
            emptyState={list.data ? <p className="py-8 text-center text-sm text-muted-foreground">—</p> : undefined}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
