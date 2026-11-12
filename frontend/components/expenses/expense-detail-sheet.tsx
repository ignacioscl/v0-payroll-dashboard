'use client'

import type * as React from 'react'
import { Eye } from 'lucide-react'

import { ExpenseStatusBadge } from '@/components/expenses/expense-status-badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { fmtAmount, fmtYmd, singleRowsOf } from '@/lib/expenses/expense-format'
import { useTranslation } from '@/lib/i18n/locale-context'
import type { ExpenseRow } from '@/lib/srs-expenses-api'

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words text-sm">{value ?? '—'}</div>
    </div>
  )
}

/** «View»: el gasto o el grupo con sus filas visibles (solo lectura, para todos). */
export function ExpenseDetailSheet({
  row,
  open,
  onOpenChange,
}: {
  row: ExpenseRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const rows = row ? singleRowsOf(row) : []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex min-h-0 w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b border-border px-4 py-4 pr-12 text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Eye className="size-4" aria-hidden />
            {t('expenses.detail')}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {row ? `${row.company.name} · ${fmtAmount(row.kind === 'group' ? row.visibleTotal : row.amount)} · ${fmtYmd(row.ticketDate)}` : ''}
          </SheetDescription>
        </SheetHeader>
        {row ? (
          <ScrollArea className="min-h-0 flex-1 px-4 py-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t('expenses.receiptDate')} value={fmtYmd(row.ticketDate)} />
              <Field label={t('expenses.status')} value={<ExpenseStatusBadge row={row} />} />
              <Field label={t('expenses.company')} value={row.company.name} />
              <Field label={t('expenses.category')} value={row.category.name} />
              <Field
                label={t('expenses.totalAmount')}
                value={fmtAmount(row.kind === 'group' ? row.visibleTotal : row.amount)}
              />
              <Field label={t('expenses.assignedTo')} value={row.author?.name} />
              <Field label={t('expenses.createdBy')} value={row.createdBy?.name} />
              <Field label={t('expenses.receiptNumber')} value={row.receiptNumber} />
              <div className="sm:col-span-2">
                <Field label={t('expenses.description')} value={row.description} />
              </div>
              <div className="sm:col-span-2">
                <Field label={t('expenses.notes')} value={row.notes} />
              </div>
              {row.idExpRepetitive ? (
                <div className="sm:col-span-2 text-xs text-muted-foreground">
                  {t('expenses.linkedRule', { id: row.idExpRepetitive })}
                </div>
              ) : null}
            </div>
            <div className="mt-4">
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {row.kind === 'group'
                  ? row.visibleRows < row.totalRows
                    ? t('expenses.allBranchesPartial', { k: row.visibleRows, n: row.totalRows })
                    : t('expenses.allBranches', { n: row.totalRows })
                  : t('expenses.branch')}
              </div>
              {row.kind === 'group' && row.readOnly ? (
                <p className="mb-2 text-xs text-amber-700">{t('expenses.partialTooltip')}</p>
              ) : null}
              <ul className="divide-y divide-border rounded-md border border-border">
                {rows.map((r) => (
                  <li key={r.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 break-words">{r.dealer.name}</span>
                    <span className="tabular-nums">{fmtAmount(r.amount)}</span>
                    <ExpenseStatusBadge row={r} />
                  </li>
                ))}
              </ul>
            </div>
          </ScrollArea>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
