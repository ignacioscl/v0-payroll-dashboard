'use client'

import { HelpCircle } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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

/** A discount in money: −$40.00 when it lowers the total, +$10.00 when a credit's raises it. */
function fmtDiscount(n: number): string {
  if (n === 0) return fmtMoney(0)
  return n > 0 ? `−${fmtMoney(n)}` : `+${fmtMoney(-n)}`
}

function StatCell({
  label,
  value,
  help,
  highlight,
  isLoading,
}: {
  label: string
  value: string
  /** What the card adds up and what it leaves out (rule 16). */
  help: string
  highlight?: 'total' | 'discount' | 'partial' | 'deleted'
  isLoading?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-muted/20 px-3 py-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-1">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t('common.kpiHelpAria')}
              className="shrink-0 cursor-pointer rounded text-muted-foreground/50 transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-72 max-w-[calc(100vw-2rem)] text-xs leading-relaxed text-muted-foreground"
          >
            <p className="mb-1 text-sm font-semibold text-foreground">{label}</p>
            {help}
          </PopoverContent>
        </Popover>
      </div>
      {isLoading ? (
        <div className="mt-2 h-5 w-24 animate-pulse rounded bg-muted-foreground/20" />
      ) : (
        <p
          className={cn(
            'mt-1 truncate text-lg font-semibold tabular-nums sm:text-xl',
            highlight === 'total' && 'text-accent dark:text-accent',
            highlight === 'discount' && 'text-amber-600 dark:text-amber-400',
            highlight === 'partial' && 'text-sky-700 dark:text-sky-300',
            highlight === 'deleted' && 'text-muted-foreground',
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
 * With the partial switch on there is one card more (Partial invoiced); with Payment = Unpaid
 * another one with what is owed over the whole history, which loads on its own so a slow answer
 * does not hold back the rest of the screen; and with Deleted = Only / Show all, the total of the
 * deleted invoices, which do not add up in the other cards (T7).
 */
export function InvoiceSummaryStrip({
  summary,
  isLoading,
  showExcludesDeleted,
  owedAllDates,
  owedAllDatesLoading,
  showDeleted,
}: {
  summary: InvoiceSummary | undefined
  isLoading?: boolean
  showExcludesDeleted?: boolean
  /** Outstanding AR with no date filter; undefined = the card is not shown. */
  owedAllDates?: number
  owedAllDatesLoading?: boolean
  /** Deleted = Only or Show all: the card with the total of the deleted invoices. */
  showDeleted?: boolean
}) {
  const { t } = useTranslation()
  const showOwed = owedAllDates !== undefined || owedAllDatesLoading === true
  const showPartial = summary?.partialInvoiced != null
  const cards = 4 + (showPartial ? 1 : 0) + (showOwed ? 1 : 0) + (showDeleted ? 1 : 0)

  // Two columns on a phone; from sm the cards flow by the width there is, so a card drops to the
  // next row instead of squeezing its number (mobile-first-responsive).
  const gridCols = 'grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))]'

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

  return (
    <div className="space-y-1.5">
      <div className={gridCols}>
        <StatCell
          label={t('invoices.summaryStatements')}
          value={String(summary.count)}
          help={t('invoices.summaryStatementsHelp')}
        />
        <StatCell
          label={t('invoices.summaryFilteredTotal')}
          value={fmtMoney(summary.total)}
          help={t('invoices.summaryFilteredTotalHelp')}
          highlight="total"
        />
        <StatCell
          label={t('invoices.totalsSubtotal')}
          value={fmtMoney(summary.subtotal)}
          help={t('invoices.summarySubtotalHelp')}
        />
        <StatCell
          label={t('invoices.totalsDiscount')}
          value={fmtDiscount(summary.discount)}
          help={t('invoices.summaryDiscountHelp')}
          highlight="discount"
        />
        {showPartial ? (
          <StatCell
            label={t('invoices.summaryPartialInvoiced')}
            value={fmtMoney(summary.partialInvoiced ?? 0)}
            help={t('invoices.summaryPartialInvoicedHelp')}
            highlight="partial"
          />
        ) : null}
        {showOwed ? (
          <StatCell
            label={t('invoices.summaryOwedAllDates')}
            value={fmtMoney(owedAllDates ?? 0)}
            help={t('invoices.summaryOwedAllDatesHelp')}
            isLoading={owedAllDatesLoading && owedAllDates === undefined}
          />
        ) : null}
        {showDeleted ? (
          <StatCell
            label={t('invoices.summaryDeleted')}
            value={fmtMoney(summary.deletedTotal ?? 0)}
            help={t('invoices.summaryDeletedHelp')}
            highlight="deleted"
          />
        ) : null}
      </div>
      {showExcludesDeleted ? (
        <p className="text-[11px] text-muted-foreground">{t('invoices.summaryExcludesDeleted')}</p>
      ) : null}
    </div>
  )
}
