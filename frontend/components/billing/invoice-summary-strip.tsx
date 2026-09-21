'use client'

import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/locale-context'
import type { InvoiceSummary } from '@/lib/srs-invoices-api'

function fmtMoney(n: number): string {
  // Sign before the symbol: -$15.00, not $-15.00.
  const abs = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return n < 0 ? `-$${abs}` : `$${abs}`
}

function StatCell({
  label,
  value,
  highlight,
  isLoading,
}: {
  label: string
  value: string
  highlight?: 'total' | 'discount' | 'partial'
  isLoading?: boolean
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-muted/20 px-3 py-3 sm:px-4">
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {isLoading ? (
        <div className="mt-2 h-5 w-24 animate-pulse rounded bg-muted-foreground/20" />
      ) : (
        <p
          className={cn(
            'mt-1 truncate text-lg font-semibold tabular-nums sm:text-xl',
            highlight === 'total' && 'text-accent dark:text-accent',
            highlight === 'discount' && 'text-amber-600 dark:text-amber-400',
            highlight === 'partial' && 'text-sky-700 dark:text-sky-300',
          )}
        >
          {value}
        </p>
      )}
    </div>
  )
}

/**
 * At-a-glance totals for the active filter (from API summary, full filter scope).
 * With the partial switch on there is one card more (Partial invoiced), and with Payment =
 * Unpaid another one with what is owed over the whole history, which loads on its own so a slow
 * answer does not hold back the rest of the screen.
 */
export function InvoiceSummaryStrip({
  summary,
  isLoading,
  showExcludesDeleted,
  owedAllDates,
  owedAllDatesLoading,
}: {
  summary: InvoiceSummary | undefined
  isLoading?: boolean
  showExcludesDeleted?: boolean
  /** Outstanding AR with no date filter; undefined = the card is not shown. */
  owedAllDates?: number
  owedAllDatesLoading?: boolean
}) {
  const { t } = useTranslation()
  const showOwed = owedAllDates !== undefined || owedAllDatesLoading === true
  const showPartial = summary?.partialInvoiced != null
  const cards = 4 + (showPartial ? 1 : 0) + (showOwed ? 1 : 0)

  // Two columns on a phone, one row from sm on: 4, 5 or 6 cards side by side.
  const gridCols = cn(
    'grid grid-cols-2 gap-3',
    cards === 4 && 'sm:grid-cols-4',
    cards === 5 && 'sm:grid-cols-5',
    cards >= 6 && 'sm:grid-cols-6',
  )

  if (isLoading && !summary) {
    return (
      <div className={gridCols}>
        {Array.from({ length: cards }).map((_, i) => (
          <div
            key={i}
            className="h-[72px] animate-pulse rounded-lg border border-border/40 bg-muted/30"
          />
        ))}
      </div>
    )
  }

  if (!summary) return null

  const discountDisplay =
    summary.discount > 0 ? `−${fmtMoney(summary.discount)}` : fmtMoney(0)

  return (
    <div className="space-y-1.5">
      <div className={gridCols}>
        <StatCell label={t('invoices.summaryStatements')} value={String(summary.count)} />
        <StatCell label={t('invoices.summaryFilteredTotal')} value={fmtMoney(summary.total)} highlight="total" />
        <StatCell label={t('invoices.totalsSubtotal')} value={fmtMoney(summary.subtotal)} />
        <StatCell label={t('invoices.totalsDiscount')} value={discountDisplay} highlight="discount" />
        {showPartial ? (
          <StatCell
            label={t('invoices.summaryPartialInvoiced')}
            value={fmtMoney(summary.partialInvoiced ?? 0)}
            highlight="partial"
          />
        ) : null}
        {showOwed ? (
          <StatCell
            label={t('invoices.summaryOwedAllDates')}
            value={fmtMoney(owedAllDates ?? 0)}
            isLoading={owedAllDatesLoading && owedAllDates === undefined}
          />
        ) : null}
      </div>
      {showExcludesDeleted ? (
        <p className="text-[11px] text-muted-foreground">{t('invoices.summaryExcludesDeleted')}</p>
      ) : null}
    </div>
  )
}
