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
}: {
  label: string
  value: string
  highlight?: 'total' | 'discount'
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 text-xl font-semibold tabular-nums',
          highlight === 'total' && 'text-accent dark:text-accent',
          highlight === 'discount' && 'text-amber-600 dark:text-amber-400',
        )}
      >
        {value}
      </p>
    </div>
  )
}

/**
 * At-a-glance totals for the active filter (from API summary, full filter scope).
 */
export function InvoiceSummaryStrip({
  summary,
  isLoading,
}: {
  summary: InvoiceSummary | undefined
  isLoading?: boolean
}) {
  const { t } = useTranslation()

  if (isLoading && !summary) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCell label={t('invoices.summaryStatements')} value={String(summary.count)} />
      <StatCell label={t('invoices.summaryFilteredTotal')} value={fmtMoney(summary.total)} highlight="total" />
      <StatCell label={t('invoices.totalsSubtotal')} value={fmtMoney(summary.subtotal)} />
      <StatCell label={t('invoices.totalsDiscount')} value={discountDisplay} highlight="discount" />
    </div>
  )
}
