'use client'

import * as React from 'react'
import { ClipboardList, Loader2, Mail, Printer } from 'lucide-react'

import { InvoiceSendEmailDialog } from '@/components/billing/invoice-send-email-dialog'
import { InvoiceStatementLogDialog } from '@/components/billing/invoice-statement-log-dialog'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { usePrintInvoiceStatementPdf } from '@/hooks/use-print-invoice-statement-pdf'
import {
  canPrintInvoice,
  canSendInvoiceEmail,
} from '@/lib/auth/billing-permissions'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import type { InvoiceRow } from '@/lib/srs-invoices-api'
import { useTranslation } from '@/lib/i18n/locale-context'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

const GENERIC_STATEMENT_TYPE = 6

function invoiceLabel(row: InvoiceRow): string {
  return row.fullNro || `#${row.id}`
}

export function InvoiceRowActions({
  row,
  idDealer,
  payedFilter,
}: {
  row: InvoiceRow
  idDealer: string
  payedFilter?: string
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { hasPermission, user } = useSrsMe()
  const printPdf = usePrintInvoiceStatementPdf()
  const [logOpen, setLogOpen] = React.useState(false)
  const [emailOpen, setEmailOpen] = React.useState(false)

  const isDeleted = row.estado === 0
  const isExternal = Boolean(user?.isCompanyTypeCompany)
  const showLog =
    !isExternal && (isDeleted || row.statementType === GENERIC_STATEMENT_TYPE)
  const showPrint = !isDeleted && canPrintInvoice(hasPermission, user?.isSystemAdmin)
  const showEmail = !isDeleted && canSendInvoiceEmail(hasPermission, user?.isSystemAdmin)

  if (!showLog && !showPrint && !showEmail) {
    return <span className="text-muted-foreground">—</span>
  }

  const label = invoiceLabel(row)

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <div className="flex items-center justify-end gap-0.5">
          {showLog ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  aria-label={t('invoices.actionLogTitle')}
                  onClick={(e) => {
                    e.stopPropagation()
                    setLogOpen(true)
                  }}
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t('invoices.actionLogTitle')}</TooltipContent>
            </Tooltip>
          ) : null}

          {showPrint ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-sky-600 hover:bg-sky-500/10 hover:text-sky-700 dark:text-sky-400"
                  aria-label={t('invoices.actionPrintTitle')}
                  disabled={printPdf.isPending}
                  onClick={(e) => {
                    e.stopPropagation()
                    printPdf.mutate(
                      { ids_invoices: String(row.id), payed: payedFilter },
                      {
                        onError: (err) => {
                          toast({
                            variant: 'destructive',
                            title: t('invoices.actionPrintError'),
                            description: getSrsErrorMessage(err, t('invoices.actionPrintError')),
                          })
                        },
                      },
                    )
                  }}
                >
                  {printPdf.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Printer className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t('invoices.actionPrintTitle')}</TooltipContent>
            </Tooltip>
          ) : null}

          {showEmail ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={row.sended === 1 ? 'default' : 'outline'}
                  size="icon"
                  className={cn(
                    'h-7 w-7',
                    row.sended === 1
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  aria-label={t('invoices.actionEmailTitle')}
                  onClick={(e) => {
                    e.stopPropagation()
                    setEmailOpen(true)
                  }}
                >
                  <Mail className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {row.sended === 1 ? t('invoices.actionEmailSent') : t('invoices.actionEmailTitle')}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </TooltipProvider>

      <InvoiceStatementLogDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        statementId={row.id}
        invoiceLabel={label}
      />

      <InvoiceSendEmailDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        statementId={row.id}
        invoiceLabel={label}
        idDealer={idDealer}
        payedFilter={payedFilter}
        sended={row.sended}
        emailsSended={row.emailsSended}
        lastSended={row.lastSended}
      />
    </>
  )
}
