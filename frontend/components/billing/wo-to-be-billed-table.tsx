'use client'

import * as React from 'react'
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import { AlertTriangle, Car, Loader2, SquareCheck, SquareX, Wallet, ClipboardList } from 'lucide-react'

import { DataTable, type DataTableColumnMeta } from '@/components/shared/data-table'
import { StateBlock } from '@/components/shared/state-block'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { useWoToBeBilledList } from '@/hooks/use-wo-to-be-billed'
import {
  formatWoAge,
  woApprovedDisplay,
  woServicesDisplay,
  woUsDate,
  woUsDateTime,
} from '@/lib/billing/wo-to-be-billed-format'
import { useTranslation } from '@/lib/i18n/locale-context'
import { fmtMoney } from '@/lib/kpi-money'
import { isSrsBusyError } from '@/lib/srs-busy-error'
import type { WoToBeBilledRow } from '@/lib/srs-wo-to-be-billed-api'
import { cn } from '@/lib/utils'

const CAR_COLOR: Record<'gray' | 'red' | 'green', string> = {
  gray: 'text-muted-foreground',
  red: 'text-destructive',
  green: 'text-emerald-600',
}

function ApprovedCell({ row }: { row: WoToBeBilledRow }) {
  const { t } = useTranslation()
  const display = woApprovedDisplay(row)
  if (display.kind === 'none') return null
  let icon: React.ReactNode
  let tip: string
  if (display.kind === 'notApproved') {
    icon = <SquareX className="size-5 text-destructive" aria-hidden />
    tip = display.note || t('woToBeBilled.tooltips.notApproved')
  } else if (display.kind === 'approved') {
    icon = <SquareCheck className="size-5 text-emerald-600" aria-hidden />
    tip = `${t('woToBeBilled.tooltips.approvedBy', { name: display.approver })}${display.date ? ` - ${woUsDateTime(display.date)}` : ''}`
  } else {
    icon = <Car className={cn('size-5', CAR_COLOR[display.color])} aria-hidden />
    const parts: string[] = []
    if (display.approver != null) {
      parts.push(
        `${t('woToBeBilled.tooltips.approvedBy', { name: display.approver })}${display.approvedDate ? ` - ${woUsDateTime(display.approvedDate)}` : ''}`,
      )
    }
    if (display.inspector != null) {
      parts.push(
        `${t('woToBeBilled.tooltips.inspectedBy', { name: display.inspector })}${display.inspectedDate ? ` - ${woUsDateTime(display.inspectedDate)}` : ''}`,
      )
    }
    if (display.internalInspector != null) {
      parts.push(
        `${t('woToBeBilled.tooltips.internalInspectedBy', { name: display.internalInspector })}${display.internalInspectedDate ? ` - ${woUsDateTime(display.internalInspectedDate)}` : ''}`,
      )
    }
    tip = parts.join(' · ')
  }
  // Sin clic: en esta solapa de legacy el clic no hace nada (fila 14 de §2).
  return tip ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex" tabIndex={0} aria-label={tip}>
          {icon}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  ) : (
    <span className="inline-flex">{icon}</span>
  )
}

/** El estado de la WO con su color y su nombre; sin clic (fila 15 de §2). */
function StatusDot({ row }: { row: WoToBeBilledRow }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-block size-3 shrink-0 rounded-full border border-border/60"
          style={{ backgroundColor: row.workflowColor ?? undefined }}
          tabIndex={0}
          aria-label={row.workflow}
        />
      </TooltipTrigger>
      <TooltipContent>{row.workflow}</TooltipContent>
    </Tooltip>
  )
}

/**
 * La tabla de WO to be Billed (plans/plan-wo-to-be-billed-v0, T9): `DataTable` común, scroll que trae de a 25,
 * selección, columnas de §6 en ese orden y el contador con el total de todo el filtro. Columnas fijas y texto cortado
 * se declaran sin mirar el ancho: el componente los suelta en celular.
 */
export function WoToBeBilledTable({
  query,
  gateReady,
  hasOneDealer,
  rowSelection,
  onRowSelectionChange,
  summary,
  renderActions,
  renderRoPo,
  pageSize,
  onPageSizeChange,
  recordsNote,
}: {
  query: ReturnType<typeof useWoToBeBilledList>
  gateReady: boolean
  hasOneDealer: boolean
  rowSelection: RowSelectionState
  onRowSelectionChange: (next: RowSelectionState) => void
  summary: { count: number; total: number } | undefined
  /** Las acciones de la fila (T10). */
  renderActions?: (row: WoToBeBilledRow) => React.ReactNode
  /** El lápiz de RO# / PO# (T10). */
  renderRoPo?: (row: WoToBeBilledRow, field: 'ro' | 'po') => React.ReactNode
  /** «Rows» del toolbar (como Invoices). */
  pageSize: number
  onPageSizeChange: (size: number) => void
  /** «Delete selected (n)», al lado del contador (T10). */
  recordsNote?: React.ReactNode
}) {
  const { t } = useTranslation()
  const { data, isError, error, isFetching, hasNextPage, isFetchingNextPage, fetchNextPage } = query
  const rows = React.useMemo(() => data?.pages.flatMap((p) => p.results) ?? [], [data])
  const onLoadMore = React.useCallback(() => {
    void fetchNextPage()
  }, [fetchNextPage])

  const ageTexts = React.useMemo(
    () => ({
      minutes: (n: number) => t('woToBeBilled.age.minutes', { n }),
      minute: t('woToBeBilled.age.minute'),
      now: t('woToBeBilled.age.now'),
    }),
    [t],
  )

  const columns = React.useMemo<ColumnDef<WoToBeBilledRow>[]>(
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
              table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? 'indeterminate' : false
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label={t('woToBeBilled.selectAll')}
            onClick={(e) => e.stopPropagation()}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label={t('woToBeBilled.selectRow')}
            onClick={(e) => e.stopPropagation()}
          />
        ),
        meta: {
          label: t('woToBeBilled.selectRow'),
          pin: 'left',
          headerClassName: 'w-[40px] px-2',
          cellClassName: 'px-2',
        } satisfies DataTableColumnMeta<WoToBeBilledRow>,
      },
      {
        id: 'vin',
        // Con `accessorFn` la columna aparece en «Columns» (`DataTableViewOptions`), como en Invoices.
        accessorFn: (r) => r.vin,
        header: t('woToBeBilled.columns.vin'),
        enableSorting: false,
        size: 190,
        cell: ({ row }) => {
          const r = row.original
          const car = [r.year, r.make, r.model, r.color].filter(Boolean).join(' / ')
          return (
            <div className="min-w-0">
              <span className="block truncate">{r.vin}</span>
              {car ? <span className="block truncate text-[11px] text-muted-foreground">{car}</span> : null}
            </div>
          )
        },
        meta: { label: t('woToBeBilled.columns.vin'), pin: 'left' } satisfies DataTableColumnMeta<WoToBeBilledRow>,
      },
      {
        id: 'stock',
        accessorFn: (r) => r.stockNumber ?? '',
        header: t('woToBeBilled.columns.stock'),
        enableSorting: false,
        size: 90,
        cell: ({ row }) => row.original.stockNumber ?? '',
        meta: { label: t('woToBeBilled.columns.stock') } satisfies DataTableColumnMeta<WoToBeBilledRow>,
      },
      {
        id: 'wo',
        accessorFn: (r) => r.fullNro,
        header: t('woToBeBilled.columns.wo'),
        enableSorting: false,
        size: 90,
        cell: ({ row }) => <span className="tabular-nums">{row.original.fullNro}</span>,
        meta: { label: t('woToBeBilled.columns.wo') } satisfies DataTableColumnMeta<WoToBeBilledRow>,
      },
      {
        id: 'invoice',
        accessorFn: (r) => r.invoiceNumbers,
        header: t('woToBeBilled.columns.invoice'),
        enableSorting: false,
        size: 100,
        cell: ({ row }) => <span className="tabular-nums">{row.original.invoiceNumbers}</span>,
        meta: { label: t('woToBeBilled.columns.invoice') } satisfies DataTableColumnMeta<WoToBeBilledRow>,
      },
      {
        id: 'date',
        accessorFn: (r) => r.fechaAlta,
        header: t('woToBeBilled.columns.date'),
        enableSorting: false,
        size: 95,
        cell: ({ row }) => <span className="tabular-nums">{woUsDate(row.original.fechaAlta)}</span>,
        meta: { label: t('woToBeBilled.columns.date') } satisfies DataTableColumnMeta<WoToBeBilledRow>,
      },
      {
        id: 'department',
        accessorFn: (r) => r.department,
        header: t('woToBeBilled.columns.department'),
        enableSorting: false,
        size: 130,
        cell: ({ row }) => <span className="block truncate">{row.original.department}</span>,
        meta: { label: t('woToBeBilled.columns.department') } satisfies DataTableColumnMeta<WoToBeBilledRow>,
      },
      {
        id: 'services',
        accessorFn: (r) => r.services.length,
        header: t('woToBeBilled.columns.services'),
        enableSorting: false,
        size: 220,
        minSize: 180,
        cell: ({ row }) => {
          const services = woServicesDisplay(row.original.services)
          return (
            <span className="block whitespace-normal">
              {services.map((s, i) => (
                <React.Fragment key={`${s.name}-${i}`}>
                  {i > 0 ? ', ' : null}
                  {s.pending ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="font-semibold" tabIndex={0}>
                          {s.name}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{t('woToBeBilled.tooltips.withoutInvoice')}</TooltipContent>
                    </Tooltip>
                  ) : (
                    s.name
                  )}
                </React.Fragment>
              ))}
            </span>
          )
        },
        meta: { label: t('woToBeBilled.columns.services') } satisfies DataTableColumnMeta<WoToBeBilledRow>,
      },
      {
        id: 'price',
        accessorFn: (r) => r.total,
        header: t('woToBeBilled.columns.price'),
        enableSorting: false,
        size: 95,
        cell: ({ row }) => <span className="tabular-nums">{fmtMoney(row.original.total)}</span>,
        meta: { label: t('woToBeBilled.columns.price'), numeric: true } satisfies DataTableColumnMeta<WoToBeBilledRow>,
      },
      {
        id: 'ro',
        accessorFn: (r) => r.ro ?? '',
        header: t('woToBeBilled.columns.ro'),
        enableSorting: false,
        size: 110,
        // La celda entera es el botón, con el valor y el lápiz chico: la de PO / RO de Invoices.
        cell: ({ row }) => renderRoPo?.(row.original, 'ro') ?? <span>{row.original.ro ?? '—'}</span>,
        meta: { label: t('woToBeBilled.columns.ro') } satisfies DataTableColumnMeta<WoToBeBilledRow>,
      },
      {
        id: 'po',
        accessorFn: (r) => r.po ?? '',
        header: t('woToBeBilled.columns.po'),
        enableSorting: false,
        size: 110,
        // La celda entera es el botón, con el valor y el lápiz chico: la de PO / RO de Invoices.
        cell: ({ row }) => renderRoPo?.(row.original, 'po') ?? <span>{row.original.po ?? '—'}</span>,
        meta: { label: t('woToBeBilled.columns.po') } satisfies DataTableColumnMeta<WoToBeBilledRow>,
      },
      {
        id: 'age',
        accessorFn: (r) => r.fechaAlta,
        header: t('woToBeBilled.columns.age'),
        enableSorting: false,
        size: 100,
        cell: ({ row }) => formatWoAge(row.original.timeWorked, row.original.idWorkflow, ageTexts),
        meta: { label: t('woToBeBilled.columns.age') } satisfies DataTableColumnMeta<WoToBeBilledRow>,
      },
      {
        id: 'approved',
        accessorFn: (r) => r.approved,
        header: t('woToBeBilled.columns.approved'),
        enableSorting: false,
        size: 80,
        cell: ({ row }) => <ApprovedCell row={row.original} />,
        meta: {
          label: t('woToBeBilled.columns.approved'),
          headerClassName: 'text-center',
          cellClassName: 'text-center',
        } satisfies DataTableColumnMeta<WoToBeBilledRow>,
      },
      {
        id: 'actions',
        header: t('woToBeBilled.columns.actions'),
        enableSorting: false,
        enableHiding: false,
        size: 150,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <StatusDot row={row.original} />
            {renderActions?.(row.original)}
          </div>
        ),
        meta: {
          label: t('woToBeBilled.columns.actions'),
          pin: 'right',
          headerClassName: 'text-right',
        } satisfies DataTableColumnMeta<WoToBeBilledRow>,
      },
    ],
    [t, ageTexts, renderActions, renderRoPo],
  )

  const emptyState = !hasOneDealer ? (
    <StateBlock icon={<Wallet className="h-6 w-6" />} title={t('woToBeBilled.selectOneDealer')} />
  ) : isError ? (
    <StateBlock
      icon={<AlertTriangle className="h-6 w-6" />}
      title={t('woToBeBilled.loadError')}
      hint={isSrsBusyError(error) ? t('common.serverBusy') : (error as Error | null)?.message}
      tone="danger"
    />
  ) : (
    <StateBlock icon={<ClipboardList className="h-6 w-6" />} title={t('woToBeBilled.empty')} />
  )


  return (
    <DataTable<WoToBeBilledRow>
      tableId="billing-wo-to-be-billed-v1"
      columns={columns}
      data={gateReady ? rows : []}
      getRowId={(row) => String(row.id)}
      isLoading={gateReady && isFetching && rows.length === 0}
      emptyState={emptyState}
      enableGlobalFilter={false}
      recordsCount={gateReady && summary ? summary.count : undefined}
      recordsCountLabel={gateReady ? t('woToBeBilled.recordsLabel') : undefined}
      // «Rows» como Invoices: cuántas trae cada tanda del scroll.
      pageSize={pageSize}
      onPageSizeChange={onPageSizeChange}
      showPageSizeInInfiniteScroll
      pageSizeOptions={[25, 50, 100]}
      recordsCountNote={recordsNote}
      enableRowSelection
      rowSelection={rowSelection}
      onRowSelectionChange={onRowSelectionChange}
      infiniteScroll={{
        hasNextPage: gateReady ? (hasNextPage ?? false) : false,
        isFetchingNextPage,
        onLoadMore,
        loadingLabel: (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            {t('invoices.loadingMore')}
          </>
        ),
      }}
      tableScrollHeight="calc(100dvh - 22rem)"
      flexColumnId="services"
      enableTableFocus
    />
  )
}
