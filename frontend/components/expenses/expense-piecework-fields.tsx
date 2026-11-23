'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useFormContext, useWatch } from 'react-hook-form'

import { PieceworkPeriodsText, PieceworkWorkOrdersTable } from '@/components/expenses/piecework-work-orders-table'
import { EmployeeCombobox } from '@/components/ttk/employee-combobox'
import type { TtkEmployeeOption } from '@/hooks/use-ttk-employee-search'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import type { ExpenseFormValues } from '@/lib/expenses/expense-form-schema'
import { keepAvailable } from '@/lib/expenses/expense-piecework'
import { isRealYmd } from '@/lib/expenses/expense-rules'
import { useTranslation } from '@/lib/i18n/locale-context'
import {
  fetchPieceworkVendors,
  fetchPieceworkWorkOrders,
  type PieceworkVendor,
  type PieceworkWorkOrder,
} from '@/lib/srs-expenses-api'

/** Un vendor como opción del combo de empleados común (foto: thumbnail de v0 o logo del legacy; si no, iniciales). */
function toEmployeeOption(v: PieceworkVendor): TtkEmployeeOption {
  return { id: v.id, nombre: v.name, thumbnailUuid: v.thumbnailUuid, logoImg: v.logoImg }
}

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
  // El combo de empleados común (foto o iniciales), con la lista de vendors filtrada acá.
  const vendorOptions = React.useMemo<TtkEmployeeOption[]>(
    () => (vendors.data?.data ?? []).map(toEmployeeOption),
    [vendors.data],
  )
  const vendorItems = React.useMemo(() => {
    const q = term.trim().toLowerCase()
    return q ? vendorOptions.filter((v) => v.nombre.toLowerCase().includes(q)) : vendorOptions
  }, [vendorOptions, term])
  const selectedVendor = React.useMemo(() => vendorOptions.find((v) => v.id === vendorId) ?? null, [vendorOptions, vendorId])

  const setSelected = (ids: number[]) => {
    form.setValue('invoiceIds', ids, { shouldDirty: true })
    form.clearErrors('invoiceIds')
  }

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
                  <EmployeeCombobox
                    value={selectedVendor}
                    onChange={(v) => {
                      field.onChange(v?.id ?? null)
                      // Otro vendor (o ninguno): las WO marcadas eran del anterior.
                      form.setValue('invoiceIds', [])
                      form.clearErrors('pieceworkVendorId')
                    }}
                    searchTerm={term}
                    onSearchTermChange={setTerm}
                    employees={vendorItems}
                    isLoading={vendors.isLoading}
                    disabled={disabled}
                    placeholder={t('expenses.selectVendor')}
                    // La lista llega entera (los vendors de la empresa): se ven sin tipear.
                    minSearchChars={0}
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

      {/* Sin vendor o sin fecha no hay texto arriba: la tabla vacía ya dice qué falta. */}
      {vendorId && month && workOrders.data ? <PieceworkPeriodsText periods={periods} /> : null}

      <FormField
        control={form.control}
        name="invoiceIds"
        render={() => (
          <FormItem>
            <div data-field="invoiceIds" className="min-w-0">
              <PieceworkWorkOrdersTable
                tableId="expense-piecework-work-orders"
                workOrders={available}
                selected={selected}
                onSelectedChange={setSelected}
                disabled={disabled}
                isLoading={workOrders.isFetching}
                emptyText={vendorId && month ? t('expenses.pieceworkNoWorkOrders') : t('expenses.pieceworkChooseVendorAndDate')}
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
