'use client'

import * as React from 'react'
import { FileStack, Printer } from 'lucide-react'

import {
  BillingActionDialog,
  BillingActionSection,
  BillingOptionTile,
  BillingToggleRow,
} from '@/components/billing/billing-action-dialog'
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

  const [reportType, setReportType] = React.useState<GeneralStatementReportType | 'general'>(
    'general',
  )
  const [excludeZero, setExcludeZero] = React.useState(false)
  const [includeGeneric, setIncludeGeneric] = React.useState(false)
  const [attachTimeCard, setAttachTimeCard] = React.useState(false)

  const hasTtk = rows.some((r) => r.statementType === TTK_TYPE)
  const dealerIds = idDealer
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => n > 0)
  const singleDealerId = dealerIds.length === 1 ? dealerIds[0] : null

  React.useEffect(() => {
    if (!open) return
    setReportType('general')
    setExcludeZero(false)
    setIncludeGeneric(false)
    setAttachTimeCard(false)
  }, [open])

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
        ids_invoices: rows.map((r) => r.id).join(','),
        id_dealer: singleDealerId,
        report_type: apiType,
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,
        attach_time_card: attachTimeCard,
        exclude_zero: reportType === '1' && excludeZero,
        include_generic: reportType === '1' && includeGeneric,
      })
      onOpenChange(false)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('invoices.actionPrintError'),
        description: getSrsErrorMessage(err, t('invoices.actionPrintError')),
      })
    }
  }

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
            disabled={printGs.isPending}
          />
          <BillingOptionTile
            selected={reportType === '1'}
            onSelect={() => setReportType('1')}
            title={t('invoices.bulkGsTypeStatement')}
            disabled={printGs.isPending}
          />
          <BillingOptionTile
            selected={reportType === '2'}
            onSelect={() => setReportType('2')}
            title={t('invoices.bulkGsTypePaidDetail')}
            disabled={printGs.isPending}
          />
        </div>
      </BillingActionSection>

      {reportType === '1' ? (
        <div className="grid gap-1.5 border-l-2 border-violet-500/30 pl-3">
          <BillingToggleRow
            checked={excludeZero}
            onCheckedChange={setExcludeZero}
            title={t('invoices.bulkGsExcludeZero')}
            disabled={printGs.isPending}
          />
          <BillingToggleRow
            checked={includeGeneric}
            onCheckedChange={setIncludeGeneric}
            title={t('invoices.bulkGsIncludeGeneric')}
            disabled={printGs.isPending}
          />
        </div>
      ) : null}

      {hasTtk ? (
        <BillingToggleRow
          checked={attachTimeCard}
          onCheckedChange={setAttachTimeCard}
          title={t('invoices.printAttachTimeCard')}
          disabled={printGs.isPending}
        />
      ) : null}
    </BillingActionDialog>
  )
}
