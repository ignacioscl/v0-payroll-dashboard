'use client'

import * as React from 'react'
import * as XLSX from 'xlsx'
import {
  FileSpreadsheet,
  Grid3x3,
  Inbox,
  List,
  Mail,
  Rows3,
} from 'lucide-react'

import {
  BillingActionDialog,
  BillingActionSection,
  BillingOptionTile,
  BillingToggleRow,
} from '@/components/billing/billing-action-dialog'
import {
  InvoiceEmailQueueFields,
  useInvoiceEmailQueuePanelState,
} from '@/components/billing/invoice-email-queue-fields'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  invoiceExportErrorMessage,
  useInvoiceExport,
  type InvoiceExportFilters,
  type InvoiceExportType,
} from '@/hooks/use-invoice-export'
import { useToast } from '@/hooks/use-toast'
import {
  DEFAULT_INVOICE_EMAIL_MESSAGE,
  loadInvoiceEmailPrefs,
  persistInvoiceEmailPrefsAfterSend,
} from '@/lib/billing/invoice-email-prefs'
import { useTranslation } from '@/lib/i18n/locale-context'
import { uniqueStatementIds } from '@/lib/billing/invoice-nro-billed'
import type { InvoiceRow } from '@/lib/srs-invoices-api'

const TTK_TYPE = 5

type ExportKind = 'grid' | 'invoice' | 'wo'
type Delivery = 'download' | 'email'

function stamp(): string {
  return new Date().toISOString().slice(0, 10)
}

function isValidEmailList(value: string): boolean {
  const parts = value
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return false
  return parts.every((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
}

export function InvoiceExportDialog({
  open,
  onOpenChange,
  rows,
  filters,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rows: InvoiceRow[]
  filters?: InvoiceExportFilters
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const exportMutation = useInvoiceExport()
  const queuePanel = useInvoiceEmailQueuePanelState(open)

  const [kind, setKind] = React.useState<ExportKind>('grid')
  const [delivery, setDelivery] = React.useState<Delivery>('download')
  const [busyClient, setBusyClient] = React.useState(false)

  const [emailTo, setEmailTo] = React.useState('')
  const [subject, setSubject] = React.useState('')
  const [message, setMessage] = React.useState(DEFAULT_INVOICE_EMAIL_MESSAGE)
  const [replyTo, setReplyTo] = React.useState('')
  const [fileName, setFileName] = React.useState('')
  const [attachTimeCard, setAttachTimeCard] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const showTimeCard = rows.some((r) => r.statementType === TTK_TYPE)
  const isServer = kind !== 'grid'
  const busy = busyClient || exportMutation.isPending

  React.useEffect(() => {
    if (!open) return
    setKind('grid')
    setDelivery('download')
    setBusyClient(false)
    setAttachTimeCard(false)
    setFileName('')
    setError(null)
    const prefs = loadInvoiceEmailPrefs()
    setEmailTo('')
    setSubject(prefs.subject)
    setMessage(prefs.message || DEFAULT_INVOICE_EMAIL_MESSAGE)
    setReplyTo(prefs.replyTo)
  }, [open])

  const idsCsv = uniqueStatementIds(rows).join(',')
  const exportType: InvoiceExportType = kind === 'wo' ? 2 : 1

  const baseServerPayload = () => ({
    exportType,
    idsInvoices: idsCsv,
    idDealer: filters?.idDealer,
    fechaDesde: filters?.fechaDesde,
    fechaHasta: filters?.fechaHasta,
    payed: filters?.payed,
    idDepartment: filters?.idDepartment,
    idService: filters?.idService,
    filterNotCero: filters?.filterNotCero,
    includeZero: filters?.includeZero,
    idsEmployees: filters?.idsEmployees,
    isNotinIdsEmployees: filters?.isNotinIdsEmployees,
    fileName: fileName.trim(),
    attachTimeCard: showTimeCard && attachTimeCard,
  })

  const onDownloadGrid = async () => {
    if (rows.length === 0) {
      toast({ variant: 'destructive', title: t('invoices.bulkSelectRequired') })
      return
    }
    setBusyClient(true)
    try {
      const data = rows.map((r) => ({
        [t('invoices.colInvoice')]: r.displayFullNro || r.fullNro || `#${r.id}`,
        [t('invoices.colType')]: r.statementType,
        [t('invoices.colPeriod')]: [r.fechaDesde, r.fechaHasta].filter(Boolean).join(' – '),
        [t('invoices.colAuthor')]: r.author ?? '',
        [t('invoices.colDetail')]:
          r.invoiceServiceSelRel || r.invoiceService || r.invoiceServicesByWo || '',
        [t('invoices.colSubtotal')]: r.subtotal,
        [t('invoices.colDiscount')]: r.nroBilled == null ? (r.discount ?? '') : '',
        [t('invoices.colTotal')]: r.total,
        [t('invoices.colCheckAmount')]: r.amount ?? '',
        [t('invoices.colCheckNumber')]: r.checkNumber ?? '',
        [t('invoices.colPo')]: r.po ?? '',
        [t('invoices.colRo')]: r.ro ?? '',
        [t('invoices.colPaid')]: r.isBilled === 1 ? 'Yes' : 'No',
      }))
      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Invoices')
      const name = `invoices_${stamp()}.xlsx`
      XLSX.writeFile(wb, name)
      toast({ title: t('invoices.bulkExportDownloadSuccess'), description: name })
      onOpenChange(false)
    } catch {
      toast({ variant: 'destructive', title: t('invoices.bulkExportError') })
    } finally {
      setBusyClient(false)
    }
  }

  const onConfirm = async () => {
    if (rows.length === 0) {
      toast({ variant: 'destructive', title: t('invoices.bulkSelectRequired') })
      return
    }

    if (!isServer) {
      await onDownloadGrid()
      return
    }

    if (delivery === 'email') {
      if (!isValidEmailList(emailTo)) {
        setError(t('invoices.actionEmailInvalid'))
        return
      }
      setError(null)
      try {
        await exportMutation.mutateAsync({
          ...baseServerPayload(),
          action: 'email',
          emailto: emailTo.trim(),
          subject: subject.trim(),
          message: message.trim(),
          replyto: replyTo.trim(),
        })
        // Best-effort: a storage failure here must not swallow the toast/close below.
        try {
          persistInvoiceEmailPrefsAfterSend(replyTo)
        } catch {
          /* ignore */
        }
        toast({
          title: t('invoices.bulkExportEmailSuccess'),
          description: emailTo.trim(),
        })
        onOpenChange(false)
      } catch (err) {
        setError(invoiceExportErrorMessage(err, t('invoices.bulkExportError')))
      }
      return
    }

    setError(null)
    try {
      await exportMutation.mutateAsync({
        ...baseServerPayload(),
        action: 'download',
      })
      toast({ title: t('invoices.bulkExportDownloadSuccess') })
      onOpenChange(false)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('invoices.bulkExportError'),
        description: invoiceExportErrorMessage(err, t('invoices.bulkExportError')),
      })
    }
  }

  const onAddToQueue = async () => {
    if (!isServer || rows.length === 0) return
    if (!queuePanel.hasActiveQueue && !queuePanel.queueName.trim()) {
      setError(t('invoices.emailQueueNameRequired'))
      return
    }
    if (emailTo.trim() && !isValidEmailList(emailTo)) {
      setError(t('invoices.actionEmailInvalid'))
      return
    }
    setError(null)
    try {
      await exportMutation.mutateAsync({
        ...baseServerPayload(),
        action: 'queue',
        emailto: emailTo.trim() || undefined,
        subject: subject.trim(),
        message: message.trim(),
        replyto: replyTo.trim(),
        queuename: queuePanel.queueName.trim(),
      })
      toast({ title: t('invoices.emailQueueSuccess') })
      onOpenChange(false)
    } catch (err) {
      setError(invoiceExportErrorMessage(err, t('invoices.emailQueueError')))
    }
  }

  const confirmLabel =
    !isServer || delivery === 'download'
      ? t('invoices.bulkExportDownload')
      : t('invoices.bulkExportSendEmail')

  return (
    <BillingActionDialog
      open={open}
      onOpenChange={onOpenChange}
      tone="emerald"
      icon={FileSpreadsheet}
      title={t('invoices.bulkExportTitle')}
      subtitle={t('invoices.bulkExportHint', { count: rows.length })}
      cancelLabel={t('common.cancel')}
      confirmLabel={confirmLabel}
      confirmIcon={
        !isServer || delivery === 'download' ? FileSpreadsheet : Mail
      }
      onConfirm={onConfirm}
      pending={busy}
      confirmDisabled={rows.length === 0}
      secondaryLabel={isServer ? t('invoices.emailQueueAdd') : undefined}
      secondaryIcon={isServer ? Inbox : undefined}
      onSecondary={isServer ? onAddToQueue : undefined}
      secondaryPending={exportMutation.isPending}
      secondaryDisabled={!isServer || rows.length === 0}
      className="sm:max-w-lg"
    >
      <BillingActionSection title={t('invoices.bulkExportType')}>
        <div className="grid gap-1.5 sm:grid-cols-3">
          <BillingOptionTile
            selected={kind === 'grid'}
            onSelect={() => {
              setKind('grid')
              setDelivery('download')
            }}
            title={t('invoices.bulkExportTypeGrid')}
            description={t('invoices.bulkExportTypeGridHint')}
            icon={Grid3x3}
            disabled={busy}
          />
          <BillingOptionTile
            selected={kind === 'invoice'}
            onSelect={() => setKind('invoice')}
            title={t('invoices.bulkExportTypeInvoice')}
            description={t('invoices.bulkExportTypeInvoiceHint')}
            icon={List}
            disabled={busy}
          />
          <BillingOptionTile
            selected={kind === 'wo'}
            onSelect={() => setKind('wo')}
            title={t('invoices.bulkExportTypeWo')}
            description={t('invoices.bulkExportTypeWoHint')}
            icon={Rows3}
            disabled={busy}
          />
        </div>
      </BillingActionSection>

      {!isServer ? null : (
        <>
          <BillingActionSection title={t('invoices.bulkExportDelivery')}>
            <div className="grid gap-1.5 sm:grid-cols-2">
              <BillingOptionTile
                selected={delivery === 'download'}
                onSelect={() => setDelivery('download')}
                title={t('invoices.bulkExportDownload')}
                icon={FileSpreadsheet}
                disabled={busy}
              />
              <BillingOptionTile
                selected={delivery === 'email'}
                onSelect={() => setDelivery('email')}
                title={t('invoices.bulkExportSendEmail')}
                icon={Mail}
                disabled={busy}
              />
            </div>
          </BillingActionSection>

          {showTimeCard ? (
            <BillingToggleRow
              checked={attachTimeCard}
              onCheckedChange={setAttachTimeCard}
              title={t('invoices.printAttachTimeCard')}
              disabled={busy}
            />
          ) : null}

          {delivery === 'email' ? (
            <div className="space-y-3 border-t border-border/60 pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="inv-export-email-to">{t('invoices.actionEmailTo')}</Label>
                <Input
                  id="inv-export-email-to"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder={t('invoices.actionEmailToPlaceholder')}
                  disabled={busy}
                />
                <p className="text-[11px] text-muted-foreground">
                  {t('invoices.actionEmailToHint')}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-export-subject">{t('invoices.actionEmailSubject')}</Label>
                <Input
                  id="inv-export-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={t('invoices.actionEmailSubjectPlaceholder')}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-export-message">{t('invoices.actionEmailMessage')}</Label>
                <Textarea
                  id="inv-export-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t('invoices.actionEmailMessagePlaceholder')}
                  rows={4}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-export-replyto">{t('invoices.actionEmailReply')}</Label>
                <Input
                  id="inv-export-replyto"
                  value={replyTo}
                  onChange={(e) => setReplyTo(e.target.value)}
                  placeholder={t('invoices.actionEmailReplyPlaceholder')}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-export-filename">{t('invoices.actionEmailFileName')}</Label>
                <Input
                  id="inv-export-filename"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  placeholder={t('invoices.actionEmailFileNamePlaceholder')}
                  disabled={busy}
                />
              </div>
            </div>
          ) : null}

          <InvoiceEmailQueueFields
            open={open}
            queueName={queuePanel.queueName}
            onQueueNameChange={queuePanel.setQueueName}
            hasActiveQueue={queuePanel.hasActiveQueue}
            activeQueueLabel={queuePanel.draft?.descripcion}
            isLoading={queuePanel.isLoading}
            disabled={busy}
            showFileName={delivery === 'download'}
            fileName={fileName}
            onFileNameChange={setFileName}
          />
        </>
      )}

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </BillingActionDialog>
  )
}
