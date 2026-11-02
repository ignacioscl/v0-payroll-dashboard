'use client'

import * as React from 'react'
import { useFormContext, useWatch } from 'react-hook-form'

import { FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useSrsDealers } from '@/hooks/use-srs-dealers'
import { fmtAmount } from '@/lib/expenses/expense-format'
import type { ExpenseFormValues } from '@/lib/expenses/expense-form-schema'
import {
  fromCents,
  isValidAmount,
  isValidPercent,
  splitAmount,
  splitEqual,
  toCents,
} from '@/lib/expenses/expense-rules'
import { useTranslation } from '@/lib/i18n/locale-context'
import { cn } from '@/lib/utils'

/**
 * Tabla de reparto de Add Expense (F3): una fila por dealer elegido con su Percent o Amount y el
 * monto que le toca, calculado en vivo con las mismas reglas que el servidor (`expense-rules.ts`).
 */
export function ExpenseSplitTable({ disabled }: { disabled?: boolean }) {
  const { t } = useTranslation()
  const { control } = useFormContext<ExpenseFormValues>()
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
    if (mode === 'equal') {
      if (!totalOk || ids.length === 0) return { amounts: {} as Record<string, string>, total: totalOk ? totalAmount : '', pctSum: null }
      const split = splitEqual(toCents(totalAmount), ids.map(Number))
      const amounts: Record<string, string> = {}
      for (const id of ids) amounts[id] = split[Number(id)]
      return { amounts, total: fromCents(toCents(totalAmount)), pctSum: null }
    }
    if (mode === 'percent') {
      let sum = 0
      let allValid = ids.length > 0
      for (const id of ids) {
        const p = branches?.[id]?.percentage ?? ''
        if (!isValidPercent(p)) allValid = false
        else sum += toCents(p)
      }
      const amounts: Record<string, string> = {}
      if (totalOk && allValid && sum === 10000) {
        const split = splitAmount(
          totalAmount,
          ids.map((id) => ({ id: Number(id), percentage: branches?.[id]?.percentage ?? '0', fixedAmount: null })),
        )
        for (const id of ids) amounts[id] = split[Number(id)]
      }
      return { amounts, total: totalOk ? fromCents(toCents(totalAmount)) : '', pctSum: allValid ? sum : null }
    }
    // amount
    let total = 0
    let allValid = ids.length > 0
    const amounts: Record<string, string> = {}
    for (const id of ids) {
      const a = branches?.[id]?.amount ?? ''
      if (!isValidAmount(a)) allValid = false
      else {
        total += toCents(a)
        amounts[id] = fromCents(toCents(a))
      }
    }
    return { amounts, total: allValid ? fromCents(total) : '', pctSum: null }
  }, [mode, totalAmount, branchIds, branches])

  const ids = branchIds ?? []
  if (mode === 'single' || ids.length === 0) return null

  const showInput = mode === 'percent' || mode === 'amount'
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
            <th className="w-32 px-3 py-2 text-right font-medium">{t('expenses.dealerAmount')}</th>
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
              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                {preview.amounts[id] ? fmtAmount(preview.amounts[id]) : '—'}
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
                  mode === 'percent' && preview.pctSum !== null && (pctOk ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'),
                )}
              >
                {mode === 'percent' ? (preview.pctSum !== null ? `${fromCents(preview.pctSum)}%` : '—') : ''}
              </td>
            ) : null}
            <td className="px-3 py-2 text-right tabular-nums">{preview.total ? fmtAmount(preview.total) : '—'}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
