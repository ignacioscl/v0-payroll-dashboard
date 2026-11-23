'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { useFormContext, useWatch } from 'react-hook-form'

import { PieceworkPeriodsText, PieceworkWorkOrdersTable } from '@/components/expenses/piecework-work-orders-table'
import { Badge } from '@/components/ui/badge'
import { FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { fmtAmount, fmtYmd } from '@/lib/expenses/expense-format'
import type { ExpenseFormValues } from '@/lib/expenses/expense-form-schema'
import { reasonTexts } from '@/lib/expenses/expense-piecework-history'
import { formatUsDateTimeForExport } from '@/lib/format-us-datetime'
import { useTranslation } from '@/lib/i18n/locale-context'
import { fetchExpensePieceworkWorkOrders, type ExpensePieceworkWorkOrders, type PieceworkHistoryEntry } from '@/lib/srs-expenses-api'

export const expensePieceworkWorkOrdersKey = (id: number) => ['expense-piecework-of-expense', id] as const

/** Lo que el form necesita al grabar: con qué WO abrió y si se pueden cambiar. */
export interface PieceworkEditState {
  initialIds: number[]
  canEdit: boolean
}

/**
 * Edit de una expense Piecework (T5b de plan-reunion-juan-18-11, D18): el vendor y la fecha fijos, las WO de la expense
 * marcadas y las libres del mismo vendor y mes en la misma tabla del alta, y abajo el historial de cambios (la noche o
 * Edit), el más nuevo arriba. Las WO marcadas van en `invoiceIds` del form; el form las graba al guardar.
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

      <PieceworkHistory entries={data?.history ?? []} loading={query.isLoading} />
    </div>
  )
}

/** El historial de cambios, como el «Expense log» (tarjetas), el más nuevo arriba. */
function PieceworkHistory({ entries, loading }: { entries: PieceworkHistoryEntry[]; loading: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="min-w-0 space-y-2" data-testid="piecework-history">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <History className="size-4" aria-hidden />
        {t('expenses.pieceworkHistory')}
      </p>
      {loading ? null : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('expenses.pieceworkHistoryEmpty')}</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((h) => (
            <li key={h.id} className="rounded-md border border-border/80 bg-muted/20 px-3 py-2.5" data-testid="piecework-history-entry">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px] font-normal">
                  {t('expenses.colWorkOrder')} {h.nro}
                </Badge>
                {h.service ? (
                  <Badge variant="outline" className="whitespace-normal text-left text-[10px] font-normal">
                    {h.service}
                  </Badge>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {t('expenses.pieceworkHistoryNightly', { date: formatUsDateTimeForExport(h.createdAt) || h.createdAt })}
                </span>
              </div>
              <ul className="mt-1.5 space-y-0.5 text-sm leading-snug">
                {reasonTexts(h.detail, h.reason, t).map((line, i) => (
                  <li key={i} className="break-words">
                    {line}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-sm tabular-nums">
                {h.oldAmount === null ? t('expenses.pieceworkHistoryNew') : fmtAmount(h.oldAmount)} → {fmtAmount(h.newAmount)}
                {h.oldDealer && h.oldDealer.id !== h.newDealer.id ? (
                  <span className="text-muted-foreground">
                    {' '}
                    ({h.oldDealer.name} → {h.newDealer.name})
                  </span>
                ) : null}
              </p>
              {h.changedBy ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {h.source === 'edit'
                    ? t('expenses.pieceworkHistoryBy', { name: h.changedBy.name })
                    : t('expenses.pieceworkHistoryWoChangedBy', {
                        name: h.changedBy.name,
                        date: formatUsDateTimeForExport(h.woChangedAt ?? '') || h.woChangedAt || '—',
                      })}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
