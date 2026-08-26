'use client'

import * as React from 'react'
import {
  ClipboardList,
  DollarSign,
  Mail,
  MoreHorizontal,
  Printer,
  StickyNote,
  Trash2,
} from 'lucide-react'

import { InvoiceDiscountDialog } from '@/components/billing/invoice-discount-dialog'
import { InvoicePrintDialog } from '@/components/billing/invoice-print-dialog'
import { InvoiceSendEmailDialog } from '@/components/billing/invoice-send-email-dialog'
import { InvoiceStatementLogDialog } from '@/components/billing/invoice-statement-log-dialog'
import { InvoiceStatementNotesDialog } from '@/components/billing/invoice-statement-notes-dialog'
import { Button } from '@/components/ui/button'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useDeleteInvoiceStatements } from '@/hooks/use-invoice-statement-mutations'
import {
  canDeleteInvoice,
  canPrintInvoice,
  canSendInvoiceEmail,
} from '@/lib/auth/billing-permissions'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import { isInvoiceRemainder } from '@/lib/billing/invoice-nro-billed'
import type { InvoiceRow } from '@/lib/srs-invoices-api'
import { useTranslation } from '@/lib/i18n/locale-context'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

const GENERIC_STATEMENT_TYPE = 6

function invoiceLabel(row: InvoiceRow): string {
  return row.fullNro || `#${row.id}`
}

function hasDiscount(row: InvoiceRow): boolean {
  const detail = row.discountDetail?.trim()
  if (detail) return true
  return row.discount != null && Number(row.discount) !== 0
}

function SignalButton({
  label,
  className,
  onClick,
  children,
}: {
  label: string
  className?: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            'inline-flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-sm px-1',
            'transition-colors hover:bg-background/80 focus-visible:outline-none',
            'focus-visible:ring-2 focus-visible:ring-ring/40',
            className,
          )}
          onClick={(e) => {
            e.stopPropagation()
            onClick()
          }}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
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
  const deleteMutation = useDeleteInvoiceStatements()

  const [logOpen, setLogOpen] = React.useState(false)
  const [emailOpen, setEmailOpen] = React.useState(false)
  const [notesOpen, setNotesOpen] = React.useState(false)
  const [discountOpen, setDiscountOpen] = React.useState(false)
  const [printOpen, setPrintOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  const isDeleted = row.estado === 0
  const isExternal = Boolean(user?.isCompanyTypeCompany)
  const notesCount = row.notesCount ?? 0
  const logCount = row.logCount ?? 0
  const emailSent = row.sended === 1
  const discountSet = hasDiscount(row)

  const showNotes = !isExternal
  const showLog =
    !isExternal && (logCount > 0 || isDeleted || row.statementType === GENERIC_STATEMENT_TYPE)
  const showPrint = !isDeleted && canPrintInvoice(hasPermission, user?.isSystemAdmin)
  const showEmail = !isDeleted && canSendInvoiceEmail(hasPermission, user?.isSystemAdmin)
  const showDiscount = !isDeleted && !isExternal && isInvoiceRemainder(row)
  const showDelete =
    !isDeleted &&
    !isExternal &&
    row.isPartialBilled === 0 &&
    canDeleteInvoice(hasPermission, user?.isSystemAdmin)

  if (!showLog && !showPrint && !showEmail && !showNotes && !showDiscount && !showDelete) {
    return <span className="text-muted-foreground">—</span>
  }

  const label = invoiceLabel(row)

  // Presence rail: only signals with data (readable at a glance, not decoration dots).
  const showNotesSignal = showNotes && notesCount > 0
  const showLogSignal = showLog && logCount > 0
  const showEmailSignal = showEmail && emailSent
  const showDiscountSignal = showDiscount && discountSet
  const hasPresence =
    showNotesSignal || showLogSignal || showEmailSignal || showDiscountSignal

  return (
    <>
      <TooltipProvider delayDuration={250}>
        <div className="flex items-center justify-end gap-1">
          {hasPresence ? (
            <div
              className={cn(
                'inline-flex items-center gap-px rounded-md border border-border/80',
                'bg-muted/50 px-0.5 py-0.5 shadow-[inset_0_1px_0_0_hsl(var(--background)/0.6)]',
              )}
              role="group"
              aria-label={t('invoices.colActions')}
            >
              {showNotesSignal ? (
                <SignalButton
                  label={t('invoices.actionNotesTitle')}
                  className="text-amber-700 dark:text-amber-400"
                  onClick={() => setNotesOpen(true)}
                >
                  <StickyNote className="size-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="text-[10px] font-semibold tabular-nums leading-none">
                    {notesCount > 9 ? '9+' : notesCount}
                  </span>
                </SignalButton>
              ) : null}

              {showLogSignal ? (
                <SignalButton
                  label={t('invoices.actionLogTitle')}
                  className="text-foreground/70"
                  onClick={() => setLogOpen(true)}
                >
                  <ClipboardList className="size-3.5 shrink-0" strokeWidth={1.75} />
                </SignalButton>
              ) : null}

              {showEmailSignal ? (
                <SignalButton
                  label={t('invoices.actionEmailSent')}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                  onClick={() => setEmailOpen(true)}
                >
                  <Mail className="size-3.5 shrink-0" strokeWidth={1.75} />
                </SignalButton>
              ) : null}

              {showDiscountSignal ? (
                <SignalButton
                  label={t('invoices.actionDiscountTitle')}
                  className="text-emerald-700 dark:text-emerald-400"
                  onClick={() => setDiscountOpen(true)}
                >
                  <DollarSign className="size-3.5 shrink-0" strokeWidth={1.75} />
                </SignalButton>
              ) : null}
            </div>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={t('invoices.colActions')}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-[12rem]"
              onClick={(e) => e.stopPropagation()}
            >
              {showNotes ? (
                <DropdownMenuItem
                  className={cn(
                    notesCount > 0 && 'text-amber-700 focus:text-amber-800 dark:text-amber-400',
                  )}
                  onClick={() => setNotesOpen(true)}
                >
                  <StickyNote className="size-4" />
                  <span className="flex-1">{t('invoices.actionNotesTitle')}</span>
                  {notesCount > 0 ? (
                    <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                      {notesCount > 99 ? '99+' : notesCount}
                    </span>
                  ) : null}
                </DropdownMenuItem>
              ) : null}

              {showLog ? (
                <DropdownMenuItem onClick={() => setLogOpen(true)}>
                  <ClipboardList className="size-4" />
                  <span className="flex-1">{t('invoices.actionLogTitle')}</span>
                  {logCount > 0 ? (
                    <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                      {logCount > 99 ? '99+' : logCount}
                    </span>
                  ) : null}
                </DropdownMenuItem>
              ) : null}

              {showPrint || showEmail || showDiscount
                ? showNotes || showLog
                  ? <DropdownMenuSeparator />
                  : null
                : null}

              {showPrint ? (
                <DropdownMenuItem onClick={() => setPrintOpen(true)}>
                  <Printer className="size-4" />
                  {t('invoices.actionPrintTitle')}
                </DropdownMenuItem>
              ) : null}

              {showEmail ? (
                <DropdownMenuItem
                  className={cn(emailSent && 'font-medium')}
                  onClick={() => setEmailOpen(true)}
                >
                  <Mail className="size-4" />
                  {emailSent ? t('invoices.actionEmailSent') : t('invoices.actionEmailTitle')}
                </DropdownMenuItem>
              ) : null}

              {showDiscount ? (
                <DropdownMenuItem
                  className={cn(
                    discountSet && 'text-emerald-700 focus:text-emerald-800 dark:text-emerald-400',
                  )}
                  onClick={() => setDiscountOpen(true)}
                >
                  <DollarSign className="size-4" />
                  {t('invoices.actionDiscountTitle')}
                </DropdownMenuItem>
              ) : null}

              {showDelete ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="size-4" />
                    {t('invoices.actionDeleteTitle')}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TooltipProvider>

      <InvoiceStatementLogDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        statementId={row.id}
        invoiceLabel={label}
      />

      <InvoicePrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        rows={[row]}
        payedFilter={payedFilter}
      />

      <InvoiceSendEmailDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        statementId={row.id}
        invoiceLabel={label}
        // The statement's own dealer — the header filter may hold several dealers and
        // only the first one reaches this component. Using that one would load another
        // dealer's sent-email accounts and file the audit row under the wrong dealer.
        idDealer={row.idDealer != null ? String(row.idDealer) : idDealer}
        payedFilter={payedFilter}
        sended={row.sended}
        emailsSended={row.emailsSended}
        lastSended={row.lastSended}
      />

      <InvoiceStatementNotesDialog
        open={notesOpen}
        onOpenChange={setNotesOpen}
        statementId={row.id}
        invoiceLabel={label}
      />

      <InvoiceDiscountDialog open={discountOpen} onOpenChange={setDiscountOpen} row={row} />

      <ConfirmActionDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        tone="danger"
        title={t('invoices.actionDeleteTitle')}
        description={t('invoices.actionDeleteConfirm', { invoice: label })}
        confirmLabel={t('invoices.actionDeleteConfirmBtn')}
        cancelLabel={t('common.cancel')}
        pending={deleteMutation.isPending}
        onConfirm={async () => {
          try {
            await deleteMutation.mutateAsync({ id_statement: row.id })
            toast({ title: t('invoices.actionDeleteSuccess') })
            setDeleteOpen(false)
          } catch (err) {
            toast({
              variant: 'destructive',
              title: t('invoices.actionDeleteError'),
              description: getSrsErrorMessage(err, t('invoices.actionDeleteError')),
            })
          }
        }}
      />
    </>
  )
}
