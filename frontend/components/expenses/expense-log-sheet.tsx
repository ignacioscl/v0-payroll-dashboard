'use client'

import { History, Loader2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useExpenseLog } from '@/hooks/use-expenses-list'
import { formatUsDateTimeForExport } from '@/lib/format-us-datetime'
import { useTranslation } from '@/lib/i18n/locale-context'

/** «Expense log»: LOG_GENERIC del gasto y, si tiene, de su grupo (F2, T2.2). */
export function ExpenseLogSheet({
  expenseId,
  title,
  open,
  onOpenChange,
}: {
  expenseId: number | null
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const query = useExpenseLog(expenseId, open)
  const rows = query.data ?? []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex min-h-0 w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b border-border px-4 py-4 pr-12 text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <History className="size-4" aria-hidden />
            {t('expenses.expenseLog')}
          </SheetTitle>
          <SheetDescription className="text-xs">{title}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1 px-4 py-3">
          {query.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('common.loading')}
            </p>
          ) : query.error ? (
            <p className="text-sm text-destructive" role="alert">
              {query.error.message}
            </p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('expenses.noChanges')}</p>
          ) : (
            <ul className="space-y-3">
              {rows.map((row) => (
                <li key={`${row.scope}-${row.id}`} className="rounded-md border border-border/80 bg-muted/20 px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {row.dealer ? (
                      <Badge variant="outline" className="whitespace-normal text-left text-[10px] font-normal">
                        {row.dealer}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="font-mono text-[10px] font-normal">
                        {row.scope === 'group' ? t('expenses.branches') : t('expenses.detail')}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{formatUsDateTimeForExport(row.date) || row.date}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-snug">{row.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('expenses.logBy', { name: row.author?.name ?? '—' })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
