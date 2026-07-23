'use client'

import * as React from 'react'
import { CalendarDays, Hash, Printer } from 'lucide-react'

import {
  BillingActionDialog,
  BillingActionSection,
  BillingOptionTile,
  BillingToggleRow,
} from '@/components/billing/billing-action-dialog'
import {
  usePrintInvoiceStatementPdf,
  type InvoicePrintOrderBy,
  type InvoicePrintReportType,
} from '@/hooks/use-print-invoice-statement-pdf'
import { useTranslation } from '@/lib/i18n/locale-context'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import type { InvoiceRow } from '@/lib/srs-invoices-api'
import { useToast } from '@/hooks/use-toast'

const TTK_STATEMENT_TYPE = 5
const GENERIC_STATEMENT_TYPE = 6

const WO_REPORT_TYPES: {
  value: InvoicePrintReportType
  labelKey:
    | 'invoices.printReportByServices'
    | 'invoices.printReportMultiserviceByServices'
    | 'invoices.printReportDetailedMultiservice'
    | 'invoices.printReportMultiserviceCarInfo'
    | 'invoices.printReportCompactMultiservice'
    | 'invoices.printReportWoDetail'
}[] = [
  { value: '-1', labelKey: 'invoices.printReportByServices' },
  { value: '1', labelKey: 'invoices.printReportMultiserviceByServices' },
  { value: '2', labelKey: 'invoices.printReportDetailedMultiservice' },
  { value: '5', labelKey: 'invoices.printReportMultiserviceCarInfo' },
  { value: '3', labelKey: 'invoices.printReportCompactMultiservice' },
  { value: '4', labelKey: 'invoices.printReportWoDetail' },
]

function isWoPrintLayout(statementType: number): boolean {
  return statementType !== TTK_STATEMENT_TYPE && statementType !== GENERIC_STATEMENT_TYPE
}

export function InvoicePrintDialog({
  open,
  onOpenChange,
  rows,
  payedFilter,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rows: InvoiceRow[]
  payedFilter?: string
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const printPdf = usePrintInvoiceStatementPdf()

  const primary = rows[0]
  const allTtkOrGeneric =
    rows.length > 0 && rows.every((r) => !isWoPrintLayout(r.statementType))
  const showWoOptions = !allTtkOrGeneric
  const showTimeCard = rows.some(
    (r) =>
      r.statementType === TTK_STATEMENT_TYPE || r.statementType === GENERIC_STATEMENT_TYPE,
  )

  const [reportType, setReportType] = React.useState<InvoicePrintReportType>('-1')
  const [orderBy, setOrderBy] = React.useState<InvoicePrintOrderBy>('1')
  const [showRo, setShowRo] = React.useState(true)
  const [showPo, setShowPo] = React.useState(true)
  const [showTag, setShowTag] = React.useState(false)
  const [showServiceNotes, setShowServiceNotes] = React.useState(false)
  const [separateZip, setSeparateZip] = React.useState(false)
  const [attachTimeCard, setAttachTimeCard] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setReportType('-1')
    setOrderBy('1')
    setShowRo(true)
    setShowPo(true)
    setShowTag(false)
    setShowServiceNotes(false)
    setSeparateZip(false)
    setAttachTimeCard(false)
  }, [open, rows])

  const label =
    rows.length === 1
      ? primary?.fullNro || `#${primary?.id}`
      : t('invoices.bulkPrintCount', { count: rows.length })

  const onPrint = async () => {
    if (rows.length === 0) return
    try {
      await printPdf.mutateAsync({
        ids_invoices: rows.map((r) => r.id).join(','),
        payed: payedFilter,
        report_type: showWoOptions ? reportType : '-1',
        order_by: showWoOptions ? orderBy : '',
        columns_visibility: showWoOptions
          ? {
              ro: showRo ? 1 : 0,
              po: showPo ? 1 : 0,
              tag: showTag ? 1 : 0,
              noteService: showServiceNotes ? 1 : 0,
            }
          : undefined,
        attach_time_card: showTimeCard && attachTimeCard,
        separate_invoices_zip: separateZip,
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
      tone="sky"
      icon={Printer}
      title={t('invoices.printDialogTitle')}
      subtitle={
        <>
          <span className="font-medium text-foreground/80 tabular-nums">{label}</span>
          <span className="mx-1.5 text-border">·</span>
          {t('invoices.printDialogHint')}
        </>
      }
      cancelLabel={t('common.cancel')}
      confirmLabel={t('invoices.printConfirm')}
      confirmIcon={Printer}
      onConfirm={onPrint}
      pending={printPdf.isPending}
      confirmDisabled={rows.length === 0}
      className="sm:max-w-xl"
    >
      {showWoOptions ? (
        <>
          <BillingActionSection title={t('invoices.printReportLabel')}>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {WO_REPORT_TYPES.map((opt) => (
                <BillingOptionTile
                  key={opt.value}
                  selected={reportType === opt.value}
                  onSelect={() => setReportType(opt.value)}
                  title={t(opt.labelKey)}
                  disabled={printPdf.isPending}
                />
              ))}
            </div>
          </BillingActionSection>

          <BillingActionSection title={t('invoices.printOrderLabel')}>
            <div className="grid gap-1.5 sm:grid-cols-2">
              <BillingOptionTile
                selected={orderBy === '1'}
                onSelect={() => setOrderBy('1')}
                title={t('invoices.printOrderDate')}
                icon={CalendarDays}
                disabled={printPdf.isPending}
              />
              <BillingOptionTile
                selected={orderBy === '2'}
                onSelect={() => setOrderBy('2')}
                title={t('invoices.printOrderWo')}
                icon={Hash}
                disabled={printPdf.isPending}
              />
            </div>
          </BillingActionSection>

          <BillingActionSection title={t('invoices.printVisibilityLabel')}>
            <div className="grid gap-1.5 sm:grid-cols-2">
              <BillingToggleRow
                checked={showRo}
                onCheckedChange={setShowRo}
                title={t('invoices.printColRo')}
                disabled={printPdf.isPending}
              />
              <BillingToggleRow
                checked={showPo}
                onCheckedChange={setShowPo}
                title={t('invoices.printColPo')}
                disabled={printPdf.isPending}
              />
              <BillingToggleRow
                checked={showTag}
                onCheckedChange={setShowTag}
                title={t('invoices.printColTag')}
                disabled={printPdf.isPending}
              />
              <BillingToggleRow
                checked={showServiceNotes}
                onCheckedChange={setShowServiceNotes}
                title={t('invoices.printColServiceNotes')}
                disabled={printPdf.isPending}
              />
            </div>
          </BillingActionSection>
        </>
      ) : null}

      <div className="space-y-1.5 border-t border-border/60 pt-4">
        <BillingToggleRow
          checked={separateZip}
          onCheckedChange={setSeparateZip}
          title={t('invoices.printZipLabel')}
          description={t('invoices.printZipHint')}
          disabled={printPdf.isPending}
        />
        {showTimeCard ? (
          <BillingToggleRow
            checked={attachTimeCard}
            onCheckedChange={setAttachTimeCard}
            title={t('invoices.printAttachTimeCard')}
            disabled={printPdf.isPending}
          />
        ) : null}
      </div>
    </BillingActionDialog>
  )
}
