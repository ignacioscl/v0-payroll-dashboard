'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import {
  DATA_TABLE_PAGE_SIZE_ALL,
  DataTable,
  DataTableColumnHeader,
  type DataTableColumnMeta,
} from '@/components/shared/data-table'
import { Checkbox } from '@/components/ui/checkbox'
import { fmtAmount, fmtYmd } from '@/lib/expenses/expense-format'
import { pieceworkRangeText, selectedTotal } from '@/lib/expenses/expense-piecework'
import { toCents } from '@/lib/expenses/expense-rules'
import { useTranslation } from '@/lib/i18n/locale-context'
import type { PieceworkWorkOrder } from '@/lib/srs-expenses-api'

/**
 * «Work orders from {from} to {to}» arriba de la tabla de WO de una expense Piecework: un solo rango, con las fechas en
 * negrita (Ignacio, 22/11). Sin pay periods, el aviso de que el mes no tiene.
 */
export function PieceworkPeriodsText({ periods }: { periods: readonly { desde: string; hasta: string }[] }) {
  const { t, locale } = useTranslation()
  const range = pieceworkRangeText([...periods], locale)
  // El texto traducido se arma con marcas en lugar de las fechas y se parte ahí.
  const MARK = '\u0001'
  const text: React.ReactNode = range
    ? t('expenses.pieceworkPeriods', { from: `${MARK}from${MARK}`, to: `${MARK}to${MARK}` })
        .split(MARK)
        .map((part, i) =>
          i % 2 === 1 ? (
            <strong key={i} className="font-semibold">
              {range[part as 'from' | 'to']}
            </strong>
          ) : (
            part
          ),
        )
    : t('expenses.pieceworkNoPeriods')
  return (
    <p className="text-sm text-foreground" data-testid="piecework-periods">
      {text}
    </p>
  )
}

/**
 * La tabla de WO de una expense Piecework, la misma en el alta (Add Expense) y en Edit (D18 de T5b): WO, VIN, dealer,
 * fecha y piecework, con el check y la fila entera para marcar. Abajo, cuántas están marcadas y su suma.
 */
export function PieceworkWorkOrdersTable({
  tableId,
  workOrders,
  selected,
  onSelectedChange,
  disabled,
  isLoading,
  emptyText,
}: {
  tableId: string
  workOrders: PieceworkWorkOrder[]
  selected: readonly number[]
  onSelectedChange: (ids: number[]) => void
  disabled: boolean
  isLoading: boolean
  emptyText: string
}) {
  const { t } = useTranslation()
  const rowSelection = React.useMemo(() => Object.fromEntries(selected.map((id) => [String(id), true])), [selected])
  const setSelection = (next: Record<string, boolean>) =>
    onSelectedChange(
      Object.entries(next)
        .filter(([, v]) => v)
        .map(([k]) => Number(k)),
    )

  const columns = React.useMemo<ColumnDef<PieceworkWorkOrder>[]>(
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
            checked={table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? 'indeterminate' : false}
            disabled={disabled || table.getRowModel().rows.length === 0}
            onCheckedChange={(value) => table.toggleAllRowsSelected(!!value)}
            aria-label={t('expenses.pieceworkSelectAll')}
            className="cursor-pointer"
          />
        ),
        // El check de Radix, dentro de un <form>, tiene un input oculto que dispara su propio clic cada vez que cambia:
        // si ese clic llega a la fila (que también marca la WO), vuelve a cambiarlo y queda en bucle. El span lo frena.
        cell: ({ row }) => (
          <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={row.getIsSelected()}
              disabled={disabled}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label={t('expenses.pieceworkSelectRow', { nro: row.original.nro })}
              className="cursor-pointer"
            />
          </span>
        ),
        meta: {
          label: t('expenses.pieceworkSelectRow', { nro: '' }),
          headerClassName: 'w-[40px] px-2',
          cellClassName: 'px-2',
        } satisfies DataTableColumnMeta<PieceworkWorkOrder>,
      },
      {
        accessorKey: 'nro',
        size: 110,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.colWorkOrder')} />,
        meta: { label: t('expenses.colWorkOrder') } satisfies DataTableColumnMeta<PieceworkWorkOrder>,
      },
      {
        accessorKey: 'vin',
        size: 170,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.colVin')} />,
        cell: ({ row }) => <span className="break-all">{row.original.vin || '—'}</span>,
        meta: { label: t('expenses.colVin') } satisfies DataTableColumnMeta<PieceworkWorkOrder>,
      },
      {
        id: 'dealer',
        accessorFn: (w) => w.dealer.name,
        size: 200,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.colBranch')} />,
        cell: ({ row }) => <span className="whitespace-normal break-words">{row.original.dealer.name}</span>,
        meta: { label: t('expenses.colBranch') } satisfies DataTableColumnMeta<PieceworkWorkOrder>,
      },
      {
        accessorKey: 'date',
        size: 110,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.colDate')} />,
        cell: ({ row }) => <span className="tabular-nums">{fmtYmd(row.original.date)}</span>,
        meta: { label: t('expenses.colDate') } satisfies DataTableColumnMeta<PieceworkWorkOrder>,
      },
      {
        id: 'piecework',
        accessorFn: (w) => toCents(w.piecework),
        size: 120,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.colPiecework')} />,
        cell: ({ row }) => <span className="tabular-nums">{fmtAmount(row.original.piecework)}</span>,
        meta: { label: t('expenses.colPiecework'), numeric: true } satisfies DataTableColumnMeta<PieceworkWorkOrder>,
      },
    ],
    [t, disabled],
  )

  return (
    <DataTable<PieceworkWorkOrder>
      tableId={tableId}
      columns={columns}
      data={workOrders}
      getRowId={(w) => String(w.idInvoice)}
      isLoading={isLoading}
      enableRowSelection={!disabled}
      rowSelection={rowSelection}
      onRowSelectionChange={setSelection}
      // Toda la fila marca o desmarca la WO, con la manito (Ignacio, 22/11); el check no repite el clic.
      onRowClick={disabled ? undefined : (w) => setSelection({ ...rowSelection, [String(w.idInvoice)]: !rowSelection[String(w.idInvoice)] })}
      defaultPageSize={DATA_TABLE_PAGE_SIZE_ALL}
      includeAllPageSize
      tableScrollHeight="40vh"
      enableGlobalFilter={false}
      enableViewOptions={false}
      emptyState={<p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>}
      footer={
        workOrders.length > 0 ? (
          <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-sm font-semibold">
            <span>{t('expenses.pieceworkSelected', { n: selected.length, total: workOrders.length })}</span>
            <span className="tabular-nums" data-testid="piecework-total">
              {fmtAmount(selectedTotal([...selected], workOrders))}
            </span>
          </div>
        ) : undefined
      }
    />
  )
}
