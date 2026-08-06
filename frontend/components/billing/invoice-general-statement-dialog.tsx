'use client'

import * as React from 'react'
import { FileStack, Inbox, Printer } from 'lucide-react'

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
import { useAddInvoiceEmailQueue } from '@/hooks/use-invoice-email-queue-add'
import {
  usePrintGeneralStatementPdf,
  type GeneralStatementReportType,
} from '@/hooks/use-print-general-statement-pdf'
import { useTranslation } from '@/lib/i18n/locale-context'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import type { InvoiceRow } from '@/lib/srs-invoices-api'
import { useToast } from '@/hooks/use-toast'

const TTK_TYPE = 5

export function InvoiceGeneralStatementDialog({
  open,
  onOpenChange,
  rows,
  idDealer,
  fechaDesde,
  fechaHasta,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rows: InvoiceRow[]
  /** May be CSV of dealers; GS requires exactly one. */
  idDealer: string
  fechaDesde?: string
  fechaHasta?: string
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const printGs = usePrintGeneralStatementPdf()
  const addToQueue = useAddInvoiceEmailQueue()
  const queuePanel = useInvoiceEmailQueuePanelState(open)

  const [reportType, setReportType] = React.useState<GeneralStatementReportType | 'general'>(
    'general',
  )
  const [excludeZero, setExcludeZero] = React.useState(false)
  const [includeGeneric, setIncludeGeneric] = React.useState(false)
  const [attachTimeCard, setAttachTimeCard] = React.useState(false)
  const [queueFileName, setQueueFileName] = React.useState('')

  const hasTtk = rows.some((r) => r.statementType === TTK_TYPE)
  // The dealer must come from the selected statements, not from the header combo:
  // the table only receives the *first* selected dealer id, so a multi-dealer
  // selection used to look single and the PDF query matched nothing.
  const rowDealerIds = Array.from(
    new Set(rows.map((r) => r.idDealer).filter((n): n is number => typeof n === 'number' && n > 0)),
  )
  const fallbackDealerIds = idDealer
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => n > 0)
  const dealerIds = rowDealerIds.length > 0 ? rowDealerIds : fallbackDealerIds
  const singleDealerId = dealerIds.length === 1 ? dealerIds[0] : null

  React.useEffect(() => {
    if (!open) return
    setReportType('general')
    setExcludeZero(false)
    setIncludeGeneric(false)
    setAttachTimeCard(false)
    setQueueFileName('')
  }, [open])

  const idsCsv = rows.map((r) => r.id).join(',')

  const onPrint = async () => {
    if (!singleDealerId) {
      toast({
        variant: 'destructive',
        title: t('invoices.bulkGsDealerError'),
      })
      return
    }
    if (rows.length === 0) {
      toast({
        variant: 'destructive',
        title: t('invoices.bulkSelectRequired'),
      })
      return
    }
    try {
      const apiType: GeneralStatementReportType =
        reportType === 'general' ? '' : reportType
      await printGs.mutateAsync({
        ids_invoices: idsCsv,
        id_dealer: singleDealerId,
        report_type: apiType,
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,
        attach_time_card: attachTimeCard,
        exclude_zero: reportType === '1' && excludeZero,
        include_generic: reportType === '1' && includeGeneric,
      })
      toast({ title: t('invoices.actionPrintSuccess') })
      onOpenChange(false)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('invoices.actionPrintError'),
        description: getSrsErrorMessage(err, t('invoices.actionPrintError')),
      })
    }
  }

  const onAddToQueue = async () => {
    if (rows.length === 0) {
      toast({
        variant: 'destructive',
        title: t('invoices.bulkSelectRequired'),
      })
      return
    }
    if (!queuePanel.hasActiveQueue && !queuePanel.queueName.trim()) {
      toast({
        variant: 'destructive',
        title: t('invoices.emailQueueNameRequired'),
      })
      return
    }
    try {
      await addToQueue.mutateAsync({
        idsInvoices: idsCsv,
        idDealer: singleDealerId ? String(singleDealerId) : undefined,
        queuename: queuePanel.queueName.trim(),
        fileName: queueFileName.trim(),
        attachTimeCard: hasTtk && attachTimeCard,
      })
      toast({ title: t('invoices.emailQueueSuccess') })
      onOpenChange(false)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('invoices.emailQueueError'),
        description: getSrsErrorMessage(err, t('invoices.emailQueueError')),
      })
    }
  }

  const busy = printGs.isPending || addToQueue.isPending

  return (
    <BillingActionDialog
      open={open}
      onOpenChange={onOpenChange}
      tone="violet"
      icon={FileStack}
      title={t('invoices.bulkGsTitle')}
      subtitle={t('invoices.bulkGsHint', { count: rows.length })}
      cancelLabel={t('common.cancel')}
      confirmLabel={t('invoices.printConfirm')}
      confirmIcon={Printer}
      onConfirm={onPrint}
      pending={printGs.isPending}
      confirmDisabled={!singleDealerId || rows.length === 0}
      secondaryLabel={t('invoices.emailQueueAdd')}
      secondaryIcon={Inbox}
      onSecondary={onAddToQueue}
      secondaryPending={addToQueue.isPending}
      secondaryDisabled={rows.length === 0}
      className="sm:max-w-md"
    >
      {!singleDealerId ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
          {t('invoices.bulkGsDealerError')}
        </p>
      ) : null}

      <BillingActionSection title={t('invoices.printReportLabel')}>
        <div className="grid gap-1.5">
          <BillingOptionTile
            selected={reportType === 'general'}
            onSelect={() => setReportType('general')}
            title={t('invoices.bulkGsTypeGeneral')}
            disabled={busy}
          />
          <BillingOptionTile
            selected={reportType === '1'}
            onSelect={() => setReportType('1')}
            title={t('invoices.bulkGsTypeStatement')}
            disabled={busy}
          />
          <BillingOptionTile
            selected={reportType === '2'}
            onSelect={() => setReportType('2')}
            title={t('invoices.bulkGsTypePaidDetail')}
            disabled={busy}
          />
        </div>
      </BillingActionSection>

      {reportType === '1' ? (
        <div className="grid gap-1.5 border-l-2 border-violet-500/30 pl-3">
          <BillingToggleRow
            checked={excludeZero}
            onCheckedChange={setExcludeZero}
            title={t('invoices.bulkGsExcludeZero')}
            disabled={busy}
          />
          <BillingToggleRow
            checked={includeGeneric}
            onCheckedChange={setIncludeGeneric}
            title={t('invoices.bulkGsIncludeGeneric')}
            disabled={busy}
          />
        </div>
      ) : null}

      {hasTtk ? (
        <BillingToggleRow
          checked={attachTimeCard}
          onCheckedChange={setAttachTimeCard}
          title={t('invoices.printAttachTimeCard')}
          disabled={busy}
        />
      ) : null}

      <InvoiceEmailQueueFields
        open={open}
        queueName={queuePanel.queueName}
        onQueueNameChange={queuePanel.setQueueName}
        hasActiveQueue={queuePanel.hasActiveQueue}
        activeQueueLabel={queuePanel.draft?.descripcion}
        isLoading={queuePanel.isLoading}
        disabled={busy}
        showFileName
        fileName={queueFileName}
        onFileNameChange={setQueueFileName}
      />
    </BillingActionDialog>
  )
}
