'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useFormContext, useWatch } from 'react-hook-form'

import { PieceworkPeriodsText, PieceworkWorkOrdersTable } from '@/components/expenses/piecework-work-orders-table'
import { FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { fmtYmd } from '@/lib/expenses/expense-format'
import type { ExpenseFormValues } from '@/lib/expenses/expense-form-schema'
import { useTranslation } from '@/lib/i18n/locale-context'
import { fetchExpensePieceworkWorkOrders, type ExpensePieceworkWorkOrders } from '@/lib/srs-expenses-api'

export const expensePieceworkWorkOrdersKey = (id: number) => ['expense-piecework-of-expense', id] as const

/** Lo que el form necesita al grabar: con qué WO abrió y si se pueden cambiar. */
export interface PieceworkEditState {
  initialIds: number[]
  canEdit: boolean
}

/**
 * Edit de una expense Piecework (T5b de plan-reunion-juan-18-11, D18): el vendor y la fecha fijos, las WO de la expense
 * marcadas y las libres del mismo vendor y mes en la misma tabla del alta. Las WO marcadas van en `invoiceIds` del form;
 * el form las graba al guardar. El historial de cambios va en el «Expense log», no acá (Ignacio, 22/11).
 */
export function ExpensePieceworkEdit({
  expenseId,
  disabled,
  onState,
}: {
  /** Una fila de la expense (si es un grupo, cualquiera de sus filas). */
  expenseId: number
  disabled: boolean
  onState: (state: PieceworkEditState) => void
}) {
  const { t } = useTranslation()
  const form = useFormContext<ExpenseFormValues>()
  const selectedRaw = useWatch({ control: form.control, name: 'invoiceIds' })
  const selected = React.useMemo(() => selectedRaw ?? [], [selectedRaw])
  const query = useQuery({
    queryKey: expensePieceworkWorkOrdersKey(expenseId),
    queryFn: () => fetchExpensePieceworkWorkOrders(expenseId),
    staleTime: 0,
  })
  const data: ExpensePieceworkWorkOrders | undefined = query.data
  const ticketDate = useWatch({ control: form.control, name: 'ticketDate' })

  // Al llegar, las WO de la expense quedan marcadas (sin marcar el form como cambiado).
  React.useEffect(() => {
    if (!data) return
    const ids = data.workOrders.filter((w) => w.selected).map((w) => w.idInvoice)
    form.setValue('invoiceIds', ids, { shouldDirty: false })
    onState({ initialIds: ids, canEdit: data.canEdit })
  }, [data, form, onState])

  const tableDisabled = disabled || !data?.canEdit

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        <FormItem>
          <FormLabel htmlFor="exp-pw-vendor">{t('expenses.vendor')}</FormLabel>
          <Input id="exp-pw-vendor" value={data?.vendor?.name ?? ''} disabled readOnly />
        </FormItem>
        <FormItem>
          <FormLabel htmlFor="exp-pw-date">{t('expenses.receiptDate')}</FormLabel>
          <Input id="exp-pw-date" value={fmtYmd(ticketDate)} disabled readOnly />
        </FormItem>
      </div>

      {data ? <PieceworkPeriodsText periods={data.periods} /> : null}
      {data && !data.canEdit ? <p className="text-xs text-muted-foreground">{t('expenses.pieceworkReadOnly')}</p> : null}

      <FormItem>
        <div data-field="invoiceIds" className="min-w-0">
          <PieceworkWorkOrdersTable
            tableId="expense-piecework-edit-work-orders"
            workOrders={data?.workOrders ?? []}
            selected={selected}
            onSelectedChange={(ids) => {
              form.setValue('invoiceIds', ids, { shouldDirty: true })
              form.clearErrors('invoiceIds')
            }}
            disabled={tableDisabled}
            isLoading={query.isFetching}
            emptyText={query.error ? query.error.message : t('expenses.pieceworkNoWorkOrders')}
          />
        </div>
        <FormMessage />
      </FormItem>
    </div>
  )
}
