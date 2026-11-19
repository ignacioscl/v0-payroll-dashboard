'use client'

import * as React from 'react'
import { Trash2 } from 'lucide-react'
import { useFormContext, useWatch } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSrsDealers } from '@/hooks/use-srs-dealers'
import { amountOnBlur, fmtAmount } from '@/lib/expenses/expense-format'
import { amountSplitTotal, currentSplitAmounts, type ExpenseFormValues } from '@/lib/expenses/expense-form-schema'
import { fromCents, isValidAmount, isValidPercent, toCents } from '@/lib/expenses/expense-rules'
import { useTranslation } from '@/lib/i18n/locale-context'
import { cn } from '@/lib/utils'

/**
 * Tabla de reparto de Add Expense (F3): una fila por dealer elegido con su Percent o Amount y el
 * monto que le toca, calculado en vivo con las mismas reglas que el servidor (`expense-rules.ts`).
 */
export function ExpenseSplitTable({ disabled }: { disabled?: boolean }) {
  const { t } = useTranslation()
  const { control, getValues, setValue } = useFormContext<ExpenseFormValues>()
  const { dealers } = useSrsDealers()
  const mode = useWatch({ control, name: 'mode' })
  const totalAmount = useWatch({ control, name: 'totalAmount' })
  const branchIds = useWatch({ control, name: 'branchIds' })
  const branches = useWatch({ control, name: 'branches' })

  const dealerName = React.useCallback(
    (id: string) => dealers.find((d) => d.id === id)?.label ?? `#${id}`,
    [dealers],
  )

  const preview = React.useMemo(() => {
    const ids = branchIds ?? []
    const totalOk = isValidAmount(totalAmount)
    const total = totalOk ? fromCents(toCents(totalAmount)) : ''
    if (mode === 'equal' || mode === 'percent') {
      // Mismo cálculo que el cambio de modo (`currentSplitAmounts`).
      const amounts = currentSplitAmounts({ mode, totalAmount, branchIds: ids, branches }) ?? {}
      if (mode === 'equal') return { amounts, total, pctSum: null, missing: 0 }
      let sum = 0
      let allValid = ids.length > 0
      for (const id of ids) {
        const p = branches?.[id]?.percentage ?? ''
        if (!isValidPercent(p)) allValid = false
        else sum += toCents(p)
      }
      return { amounts, total, pctSum: allValid ? sum : null, missing: 0 }
    }
    // amount: el Total suma lo cargado aunque falte algún dealer, y dice cuántos faltan.
    const { total: sum, missing } = amountSplitTotal({ mode, totalAmount, branchIds: ids, branches })
    return { amounts: {}, total: sum, pctSum: null, missing }
  }, [mode, totalAmount, branchIds, branches])

  /** Tacho de la fila: saca el dealer de la tabla y del combo Dealers; el reparto se recalcula solo. Sin confirmación:
   * el gasto todavía no está grabado (reunión con Juan 18/11, tema 8). */
  const removeDealer = (id: string) => {
    setValue(
      'branchIds',
      (getValues('branchIds') ?? []).filter((x) => x !== id),
      { shouldDirty: true, shouldValidate: true },
    )
    const { [id]: _removed, ...rest } = getValues('branches') ?? {}
    setValue('branches', rest, { shouldDirty: true })
  }

  const ids = branchIds ?? []
  if (mode === 'single' || ids.length === 0) return null

  const showInput = mode === 'percent' || mode === 'amount'
  // By amount: el importe es el que se escribe; una segunda columna lo repetiría.
  const showPreview = mode !== 'amount'
  const pctOk = preview.pctSum === 10000

  return (
    <div className="min-w-0 overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">{t('expenses.branch')}</th>
            {showInput ? (
              <th className="w-36 px-3 py-2 text-right font-medium">
                {mode === 'percent' ? t('expenses.percent') : t('expenses.amount')}
              </th>
            ) : null}
            {showPreview ? <th className="w-32 px-3 py-2 text-right font-medium">{t('expenses.dealerAmount')}</th> : null}
            <th className="w-10 px-1 py-2" aria-hidden />
          </tr>
        </thead>
        <tbody>
          {ids.map((id) => (
            <tr key={id} className="border-t border-border/60">
              <td className="whitespace-normal break-words px-3 py-1.5">{dealerName(id)}</td>
              {showInput ? (
                <td className="px-3 py-1.5 align-top">
                  <FormField
                    control={control}
                    name={mode === 'percent' ? `branches.${id}.percentage` : `branches.${id}.amount`}
                    render={({ field }) => (
                      <FormItem className="gap-0">
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ''}
                            inputMode="decimal"
                            onBlur={() => {
                              if (mode === 'amount') field.onChange(amountOnBlur(field.value ?? ''))
                              field.onBlur()
                            }}
                            disabled={disabled}
                            className="h-8 text-right text-sm tabular-nums"
                            aria-label={`${dealerName(id)} ${mode === 'percent' ? t('expenses.percent') : t('expenses.amount')}`}
                          />
                        </FormControl>
                        <FormMessage className="text-right" />
                      </FormItem>
                    )}
                  />
                </td>
              ) : null}
              {showPreview ? (
                <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                  {preview.amounts[id] ? fmtAmount(preview.amounts[id]) : '—'}
                </td>
              ) : null}
              <td className="px-1 py-1.5 text-right align-top">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7 text-destructive"
                      disabled={disabled}
                      onClick={() => removeDealer(id)}
                      aria-label={t('expenses.removeDealerFromSplit', { dealer: dealerName(id) })}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{t('expenses.removeDealerFromSplit', { dealer: dealerName(id) })}</TooltipContent>
                </Tooltip>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-border bg-muted/30 text-sm font-medium">
          <tr>
            <td className="px-3 py-2">{t('expenses.total')}</td>
            {showInput ? (
              <td
                className={cn(
                  'px-3 py-2 text-right tabular-nums',
                  mode === 'percent' && preview.pctSum !== null && (pctOk ? 'text-emerald-700' : 'text-destructive'),
                )}
              >
                {mode === 'percent'
                  ? preview.pctSum !== null
                    ? `${fromCents(preview.pctSum)}%`
                    : '—'
                  : fmtAmount(preview.total)}
                {preview.missing ? (
                  <div className="text-[11px] font-normal text-amber-700">
                    {t('expenses.dealersWithoutAmount', { count: preview.missing })}
                  </div>
                ) : null}
              </td>
            ) : null}
            {showPreview ? (
              <td className="px-3 py-2 text-right tabular-nums">{preview.total ? fmtAmount(preview.total) : '—'}</td>
            ) : null}
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
