'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useFormContext, useWatch } from 'react-hook-form'

import {
  DATA_TABLE_PAGE_SIZE_ALL,
  DataTable,
  DataTableColumnHeader,
  type DataTableColumnMeta,
} from '@/components/shared/data-table'
import { SearchableCombobox } from '@/components/shared/searchable-combobox'
import { Checkbox } from '@/components/ui/checkbox'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { fmtAmount, fmtYmd } from '@/lib/expenses/expense-format'
import type { ExpenseFormValues } from '@/lib/expenses/expense-form-schema'
import { keepAvailable, selectedTotal } from '@/lib/expenses/expense-piecework'
import { isRealYmd, toCents } from '@/lib/expenses/expense-rules'
import { formatUsCalendarDate } from '@/lib/format-us-datetime'
import { useTranslation } from '@/lib/i18n/locale-context'
import {
  fetchPieceworkVendors,
  fetchPieceworkWorkOrders,
  type PieceworkVendor,
  type PieceworkWorkOrder,
} from '@/lib/srs-expenses-api'

export const pieceworkVendorsKey = ['expense-piecework-vendors'] as const
export const pieceworkWorkOrdersKey = (vendorId: number, month: string) => ['expense-piecework-work-orders', vendorId, month] as const

/**
 * «Type: Piecework» de Add Expense (temas 3 y 4 de plan-reunion-juan-18-11, D4–D8): vendor y fecha → las WO del vendor
 * de los pay periods que terminan en el mes de la fecha (los del Payroll de Monthly Closing) que no están en otra
 * expense Piecework → se marcan → el monto es la suma, repartido por el dealer de cada WO (lo arma el Nest).
 */
export function ExpensePieceworkFields({
  disabled,
  todayNy,
  onWorkOrders,
}: {
  disabled: boolean
  todayNy: string
  /** La lista que se ve, para que el form sepa los dealers al grabar. */
  onWorkOrders?: (wos: PieceworkWorkOrder[]) => void
}) {
  const { t } = useTranslation()
  const form = useFormContext<ExpenseFormValues>()
  const vendorId = useWatch({ control: form.control, name: 'pieceworkVendorId' })
  const ticketDate = useWatch({ control: form.control, name: 'ticketDate' })
  const selectedRaw = useWatch({ control: form.control, name: 'invoiceIds' })
  const selected = React.useMemo(() => selectedRaw ?? [], [selectedRaw])
  const month = isRealYmd(ticketDate) ? ticketDate.slice(0, 7) : ''

  const vendors = useQuery({ queryKey: pieceworkVendorsKey, queryFn: fetchPieceworkVendors, staleTime: 60_000 })
  const workOrders = useQuery({
    queryKey: pieceworkWorkOrdersKey(vendorId ?? 0, month),
    queryFn: () => fetchPieceworkWorkOrders(vendorId as number, month),
    enabled: Boolean(vendorId) && Boolean(month),
    staleTime: 0,
  })
  const available = React.useMemo(() => workOrders.data?.workOrders ?? [], [workOrders.data])
  const periods = workOrders.data?.periods ?? []

  // Al cambiar el vendor o el mes, las marcadas que ya no están en la lista se sueltan.
  React.useEffect(() => {
    if (!workOrders.data) return
    const kept = keepAvailable(form.getValues('invoiceIds') ?? [], available)
    if (kept.length !== (form.getValues('invoiceIds') ?? []).length) form.setValue('invoiceIds', kept)
    onWorkOrders?.(available)
  }, [workOrders.data, available, form, onWorkOrders])

  const [term, setTerm] = React.useState('')
  const vendorItems = React.useMemo(() => {
    const all = vendors.data?.data ?? []
    const q = term.trim().toLowerCase()
    return q ? all.filter((v) => v.name.toLowerCase().includes(q)) : all
  }, [vendors.data, term])
  const selectedVendor = React.useMemo(
    () => (vendors.data?.data ?? []).find((v) => v.id === vendorId) ?? null,
    [vendors.data, vendorId],
  )

  const rowSelection = React.useMemo(() => Object.fromEntries(selected.map((id) => [String(id), true])), [selected])
  const setSelection = (next: Record<string, boolean>) => {
    form.setValue(
      'invoiceIds',
      Object.entries(next)
        .filter(([, v]) => v)
        .map(([k]) => Number(k)),
      { shouldDirty: true },
    )
    form.clearErrors('invoiceIds')
  }

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
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            disabled={disabled}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label={t('expenses.pieceworkSelectRow', { nro: row.original.nro })}
            className="cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          />
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

  // Sin vendor o sin fecha no hay texto arriba: la tabla vacía ya dice qué falta.
  const periodsText = !vendorId || !month
    ? ''
    : workOrders.data
      ? periods.length
        ? t('expenses.pieceworkPeriods', {
            periods: periods.map((p) => `${formatUsCalendarDate(p.desde)} – ${formatUsCalendarDate(p.hasta)}`).join(', '),
          })
        : t('expenses.pieceworkNoPeriods')
      : ''

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        <FormField
          control={form.control}
          name="pieceworkVendorId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('expenses.vendor')}</FormLabel>
              <FormControl>
                <div data-field="pieceworkVendorId" className="min-w-0">
                  <SearchableCombobox<PieceworkVendor>
                    value={selectedVendor}
                    onChange={(v) => {
                      field.onChange(v?.id ?? null)
                      form.clearErrors('pieceworkVendorId')
                    }}
                    searchTerm={term}
                    onSearchTermChange={setTerm}
                    items={vendorItems}
                    isLoading={vendors.isLoading}
                    disabled={disabled}
                    getItemKey={(v) => v.id}
                    getItemLabel={(v) => v.name}
                    placeholder={t('expenses.selectVendor')}
                    emptyTitle={t('expenses.noVendors')}
                    showFooterHint={false}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="ticketDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="exp-date">{t('expenses.receiptDate')}</FormLabel>
              <FormControl>
                <Input id="exp-date" type="date" max={todayNy} disabled={disabled} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {periodsText ? <p className="text-sm font-semibold text-foreground" data-testid="piecework-periods">{periodsText}</p> : null}

      <FormField
        control={form.control}
        name="invoiceIds"
        render={() => (
          <FormItem>
            <div data-field="invoiceIds" className="min-w-0">
              <DataTable<PieceworkWorkOrder>
                tableId="expense-piecework-work-orders"
                columns={columns}
                data={available}
                getRowId={(w) => String(w.idInvoice)}
                isLoading={workOrders.isFetching}
                enableRowSelection={!disabled}
                rowSelection={rowSelection}
                onRowSelectionChange={setSelection}
                defaultPageSize={DATA_TABLE_PAGE_SIZE_ALL}
                includeAllPageSize
                tableScrollHeight="40vh"
                enableGlobalFilter={false}
                enableViewOptions={false}
                emptyState={
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {vendorId && month ? t('expenses.pieceworkNoWorkOrders') : t('expenses.pieceworkChooseVendorAndDate')}
                  </p>
                }
                footer={
                  available.length > 0 ? (
                    <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-sm font-semibold">
                      <span>{t('expenses.pieceworkSelected', { n: selected.length, total: available.length })}</span>
                      <span className="tabular-nums" data-testid="piecework-total">
                        {fmtAmount(selectedTotal(selected, available))}
                      </span>
                    </div>
                  ) : undefined
                }
              />
            </div>
            <FormMessage />
          </FormItem>
        )}
      />
      <p className="text-xs text-muted-foreground">{t('expenses.pieceworkHint')}</p>
    </div>
  )
}
