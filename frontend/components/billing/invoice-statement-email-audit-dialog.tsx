'use client'

import { Loader2 } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useInvoiceStatementEmailLog } from '@/hooks/use-invoice-statement-email-log'
import { formatInvoiceEmailDate } from '@/lib/billing/invoice-email-ui'
import { useTranslation } from '@/lib/i18n/locale-context'

export function InvoiceStatementEmailAuditDialog({
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
  const { data, isLoading, isError, error } = useInvoiceStatementEmailLog(statementId, open)
  const entries = data ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden sm:max-w-lg">
        <DialogHeader className="border-b border-border pb-3">
          <DialogTitle className="text-base">{t('invoices.actionEmailAuditTitle')}</DialogTitle>
          <DialogDescription className="text-xs tabular-nums">{invoiceLabel}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto py-3">
          {isLoading ? (
            <div className="flex h-28 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : t('invoices.actionEmailAuditError')}
            </p>
          ) : entries.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              {t('invoices.actionEmailAuditEmpty')}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 font-medium">{t('invoices.actionEmailAuditAuthor')}</th>
                    <th className="px-2 py-2 font-medium">{t('invoices.actionEmailAuditTo')}</th>
                    <th className="px-2 py-2 font-medium">{t('invoices.actionEmailAuditSent')}</th>
                    <th className="px-2 py-2 font-medium">{t('invoices.actionEmailAuditRead')}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, index) => (
                    <tr key={`${entry.email ?? 'email'}-${entry.fecha ?? index}`} className="border-t border-border/70">
                      <td className="px-2 py-2">{entry.author || '—'}</td>
                      <td className="px-2 py-2">{entry.email || '—'}</td>
                      <td className="px-2 py-2 tabular-nums">{formatInvoiceEmailDate(entry.fecha)}</td>
                      <td className="px-2 py-2 tabular-nums">{formatInvoiceEmailDate(entry.readedDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
