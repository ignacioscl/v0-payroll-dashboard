'use client'

import * as React from 'react'
import * as XLSX from 'xlsx'
import { FileSpreadsheet, FileText, Mail } from 'lucide-react'

import {
  BillingActionDialog,
  BillingActionSection,
  BillingOptionTile,
} from '@/components/billing/billing-action-dialog'
import { useTranslation } from '@/lib/i18n/locale-context'
import type { InvoiceRow } from '@/lib/srs-invoices-api'
import { useToast } from '@/hooks/use-toast'

function stamp(): string {
  return new Date().toISOString().slice(0, 10)
}

export function InvoiceExportDialog({
  open,
  onOpenChange,
  rows,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rows: InvoiceRow[]
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [format, setFormat] = React.useState<'xlsx' | 'csv'>('xlsx')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setFormat('xlsx')
    setBusy(false)
  }, [open])

  const onDownload = async () => {
    if (rows.length === 0) {
      toast({ variant: 'destructive', title: t('invoices.bulkSelectRequired') })
      return
    }
    setBusy(true)
    try {
      const data = rows.map((r) => ({
        [t('invoices.colInvoice')]: r.fullNro || `#${r.id}`,
        [t('invoices.colType')]: r.statementType,
        [t('invoices.colPeriod')]: [r.fechaDesde, r.fechaHasta].filter(Boolean).join(' – '),
        [t('invoices.colAuthor')]: r.author ?? '',
        [t('invoices.colDetail')]:
          r.invoiceServiceSelRel || r.invoiceService || r.invoiceServicesByWo || '',
        [t('invoices.colSubtotal')]: r.subtotal,
        [t('invoices.colDiscount')]: r.discount ?? '',
        [t('invoices.colTotal')]: r.total,
        [t('invoices.colPo')]: r.po ?? '',
        [t('invoices.colRo')]: r.ro ?? '',
        [t('invoices.colPaid')]:
          r.isBilled === 1 ? 'Yes' : r.isPartialBilled === 1 ? 'Partial' : 'No',
      }))
      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Invoices')
      const name = `invoices_${stamp()}.${format}`
      if (format === 'csv') {
        XLSX.writeFile(wb, name, { bookType: 'csv' })
      } else {
        XLSX.writeFile(wb, name)
      }
      onOpenChange(false)
    } catch {
      toast({ variant: 'destructive', title: t('invoices.bulkExportError') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <BillingActionDialog
      open={open}
      onOpenChange={onOpenChange}
      tone="emerald"
      icon={FileSpreadsheet}
      title={t('invoices.bulkExportTitle')}
      subtitle={t('invoices.bulkExportHint', { count: rows.length })}
      cancelLabel={t('common.cancel')}
      confirmLabel={t('invoices.bulkExportDownload')}
      confirmIcon={FileSpreadsheet}
      onConfirm={onDownload}
      pending={busy}
      confirmDisabled={rows.length === 0}
      className="sm:max-w-md"
    >
      <BillingActionSection title={t('invoices.bulkExportFormat')}>
        <div className="grid gap-2">
          <BillingOptionTile
            selected={format === 'xlsx'}
            onSelect={() => setFormat('xlsx')}
            title="Excel (.xlsx)"
            description={t('invoices.bulkExportXlsxHint')}
            icon={FileSpreadsheet}
            disabled={busy}
          />
          <BillingOptionTile
            selected={format === 'csv'}
            onSelect={() => setFormat('csv')}
            title="CSV (.csv)"
            description={t('invoices.bulkExportCsvHint')}
            icon={FileText}
            disabled={busy}
          />
        </div>
      </BillingActionSection>

      <p className="flex items-start gap-2 rounded-lg border border-dashed border-border/80 bg-muted/25 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        <Mail className="mt-0.5 size-3.5 shrink-0 opacity-80" strokeWidth={1.75} />
        {t('invoices.bulkExportEmailHint')}
      </p>
    </BillingActionDialog>
  )
}
