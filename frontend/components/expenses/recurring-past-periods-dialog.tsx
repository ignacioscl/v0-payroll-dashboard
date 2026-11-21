'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { AlertTriangle, CalendarClock, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'

import { FormDialog } from '@/components/layout/form-dialog'
import {
  DATA_TABLE_PAGE_SIZE_ALL,
  DataTable,
  DataTableColumnHeader,
  type DataTableColumnMeta,
} from '@/components/shared/data-table'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { invalidateExpenses } from '@/hooks/use-expenses-list'
import { RULES_LIST_KEY } from '@/hooks/use-recurring-rules'
import { fmtAmount, fmtYmd } from '@/lib/expenses/expense-format'
import { useTranslation } from '@/lib/i18n/locale-context'
import { fetchRulePastPeriods, generateRulePastPeriods, type RulePastPeriods } from '@/lib/srs-expenses-api'

export const rulePastPeriodsKey = (id: number) => ['expense-rule-past-periods', id] as const

/** La vista previa de los períodos pasados de una regla; `id` null = no se pide. */
export function useRulePastPeriods(id: number | null) {
  return useQuery<RulePastPeriods>({
    queryKey: rulePastPeriodsKey(id ?? 0),
    queryFn: () => fetchRulePastPeriods(id as number),
    enabled: id !== null && id > 0,
    staleTime: 0,
  })
}

type PastRow = { date: string; dealer: string; amount: string }

/**
 * «Past periods» (tema 1 de plan-reunion-juan-18-11, D1): los gastos de los períodos de la regla que ya pasaron y
 * todavía no tienen gasto de la regla, una fila por período y dealer. «Generate N expenses» los graba pendientes de
 * aprobación; «Skip» cierra sin grabar. Se cargan aunque ya haya un gasto a mano en ese mes (D2).
 */
export function RecurringPastPeriodsDialog({
  rule,
  onClose,
}: {
  rule: { id: number; description: string } | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const preview = useRulePastPeriods(rule?.id ?? null)
  const generate = useMutation({
    mutationFn: (id: number) => generateRulePastPeriods(id),
    onSuccess: (res) => {
      invalidateExpenses(queryClient)
      void queryClient.invalidateQueries({ queryKey: RULES_LIST_KEY })
      void queryClient.invalidateQueries({ queryKey: rulePastPeriodsKey(rule?.id ?? 0) })
      toast.success(t('expenses.pastPeriodsGenerated', { n: res.expenses }))
      onClose()
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('common.failedToLoad')),
  })

  const data = preview.data
  const rows = React.useMemo<PastRow[]>(
    () => (data?.periods ?? []).flatMap((p) => p.rows.map((r) => ({ date: p.date, dealer: r.dealer.name, amount: r.amount }))),
    [data],
  )

  const columns = React.useMemo<ColumnDef<PastRow>[]>(
    () => [
      {
        accessorKey: 'date',
        size: 120,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.colDate')} />,
        cell: ({ row }) => <span className="tabular-nums">{fmtYmd(row.original.date)}</span>,
        meta: { label: t('expenses.colDate') } satisfies DataTableColumnMeta<PastRow>,
      },
      {
        accessorKey: 'dealer',
        size: 260,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.colBranch')} />,
        cell: ({ row }) => <span className="whitespace-normal break-words">{row.original.dealer}</span>,
        meta: { label: t('expenses.colBranch') } satisfies DataTableColumnMeta<PastRow>,
      },
      {
        accessorKey: 'amount',
        size: 130,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('expenses.colAmount')} />,
        cell: ({ row }) => <span className="tabular-nums">{fmtAmount(row.original.amount)}</span>,
        meta: { label: t('expenses.colAmount'), numeric: true } satisfies DataTableColumnMeta<PastRow>,
      },
    ],
    [t],
  )

  if (!rule) return null
  const canGenerate = Boolean(data && !data.problem && data.expenses > 0)
  const busy = generate.isPending

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={t('expenses.pastPeriodsTitle')}
      description={rule.description}
      busy={busy}
      footer={
        <>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            <X className="size-4" />
            {t('expenses.pastPeriodsSkip')}
          </Button>
          {canGenerate ? (
            <Button type="button" disabled={busy} onClick={() => generate.mutate(rule.id)}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <CalendarClock className="size-4" />}
              {t('expenses.pastPeriodsGenerate', { n: data?.expenses ?? 0 })}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-4">
        {preview.isError ? (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle className="line-clamp-none">
              {preview.error instanceof Error ? preview.error.message : t('common.failedToLoad')}
            </AlertTitle>
          </Alert>
        ) : null}
        {data?.problem ? (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle className="line-clamp-none">{t('expenses.pastPeriodsProblem', { problem: data.problem })}</AlertTitle>
          </Alert>
        ) : null}
        {data && !data.problem ? (
          <p className="text-sm text-muted-foreground">
            {data.expenses > 0
              ? t('expenses.pastPeriodsHint', { periods: data.periods.length, n: data.expenses })
              : t('expenses.pastPeriodsNone')}
          </p>
        ) : null}
        {!data?.problem ? (
          <DataTable<PastRow>
            tableId="recurring-past-periods"
            columns={columns}
            data={rows}
            getRowId={(_, i) => String(i)}
            isLoading={preview.isFetching}
            defaultPageSize={DATA_TABLE_PAGE_SIZE_ALL}
            includeAllPageSize
            tableScrollHeight="50vh"
            enableGlobalFilter={false}
            enableViewOptions={false}
            emptyState={<p className="py-8 text-center text-sm text-muted-foreground">{t('expenses.pastPeriodsNone')}</p>}
            footer={
              rows.length > 0 ? (
                <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-sm font-semibold">
                  <span>{t('expenses.total')}</span>
                  <span className="tabular-nums">{fmtAmount(data?.total ?? '0')}</span>
                </div>
              ) : undefined
            }
          />
        ) : null}
      </div>
    </FormDialog>
  )
}
