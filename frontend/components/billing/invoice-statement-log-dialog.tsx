'use client'

import { Loader2 } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useInvoiceStatementLog } from '@/hooks/use-invoice-statement-log'
import type { InvoiceStatementLogEntry } from '@/hooks/use-invoice-statement-log'
import { useTranslation } from '@/lib/i18n/locale-context'
import { cn } from '@/lib/utils'

function formatLogDate(value?: string): string {
  if (!value) return '—'
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function LogSnapshot({ descJson }: { descJson?: string | Record<string, unknown> }) {
  if (!descJson) return null
  try {
    const parsed =
      typeof descJson === 'string' ? (JSON.parse(descJson) as Record<string, unknown>) : descJson
    return (
      <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-border/60 bg-muted/40 p-2 text-[10px] leading-snug text-muted-foreground">
        {JSON.stringify(parsed, null, 2)}
      </pre>
    )
  } catch {
    return (
      <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-border/60 bg-muted/40 p-2 text-[10px] leading-snug text-muted-foreground">
        {String(descJson)}
      </pre>
    )
  }
}

function LogCard({ entry }: { entry: InvoiceStatementLogEntry }) {
  const author = entry.autor?.nombre?.trim()
  return (
    <div className="rounded-lg border border-border/70 bg-card px-3 py-2.5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{entry.descCambio || '—'}</p>
          {author ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {entry.descCambio ? `By ${author}` : author}
            </p>
          ) : null}
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div className="tabular-nums">{formatLogDate(entry.fecha)}</div>
          {entry.origen ? (
            <span className="mt-1 inline-block rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
              {entry.origen}
            </span>
          ) : null}
          {entry.age ? <div className="mt-1 text-[10px]">{entry.age}</div> : null}
        </div>
      </div>
      <LogSnapshot descJson={entry.descJson} />
    </div>
  )
}

export function InvoiceStatementLogDialog({
  open,
  onOpenChange,
  statementId,
  invoiceLabel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  statementId: number | null
  invoiceLabel: string
}) {
  const { t } = useTranslation()
  const { data, isLoading, isError, error } = useInvoiceStatementLog(statementId, open)
  const entries = data ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden sm:max-w-lg">
        <DialogHeader className="border-b border-border pb-3">
          <DialogTitle className="text-base">{t('invoices.actionLogTitle')}</DialogTitle>
          <DialogDescription className="text-xs tabular-nums">{invoiceLabel}</DialogDescription>
        </DialogHeader>

        <div className={cn('min-h-0 flex-1 overflow-y-auto py-3')}>
          {isLoading ? (
            <div className="flex h-28 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : t('invoices.actionLogError')}
            </p>
          ) : entries.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">{t('invoices.actionLogEmpty')}</p>
          ) : (
            <div className="space-y-2">
              {entries.map((entry, index) => (
                <LogCard key={`${entry.fecha ?? 'log'}-${index}`} entry={entry} />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
