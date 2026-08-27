'use client'

import * as React from 'react'
import { History, Inbox, Loader2, Mail, X } from 'lucide-react'

import { InvoiceEmailQueueFields, useInvoiceEmailQueuePanelState } from '@/components/billing/invoice-email-queue-fields'
import { InvoiceStatementEmailAuditDialog } from '@/components/billing/invoice-statement-email-audit-dialog'
import { SentEmailAccountCombobox } from '@/components/billing/sent-email-account-combobox'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAddInvoiceEmailQueue } from '@/hooks/use-invoice-email-queue-add'
import { useInvoiceSentEmailAccounts } from '@/hooks/use-invoice-sent-email-accounts'
import { useToast } from '@/hooks/use-toast'
import { useSendInvoiceEmail } from '@/hooks/use-send-invoice-email'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import {
  DEFAULT_INVOICE_EMAIL_MESSAGE,
  loadInvoiceEmailPrefs,
  persistInvoiceEmailPrefsAfterSend,
} from '@/lib/billing/invoice-email-prefs'
import {
  appendEmailToField,
  formatInvoiceEmailDate,
} from '@/lib/billing/invoice-email-ui'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import { useTranslation } from '@/lib/i18n/locale-context'
import { cn } from '@/lib/utils'

function isValidEmailList(value: string): boolean {
  const parts = value
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return false
  return parts.every((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
}

export function InvoiceSendEmailDialog({
  open,
  onOpenChange,
  statementId,
  invoiceLabel,
  idDealer,
  payedFilter,
  sended = 0,
  emailsSended,
  lastSended,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  statementId: number | null
  invoiceLabel: string
  idDealer: string
  payedFilter?: string
  sended?: number
  emailsSended?: string
  lastSended?: string
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { user } = useSrsMe()
  const sendEmail = useSendInvoiceEmail()
  const addToQueue = useAddInvoiceEmailQueue()
  const queuePanel = useInvoiceEmailQueuePanelState(open)
  const sentAccounts = useInvoiceSentEmailAccounts(idDealer, open)
  const [emailTo, setEmailTo] = React.useState('')
  const [subject, setSubject] = React.useState('')
  const [message, setMessage] = React.useState(DEFAULT_INVOICE_EMAIL_MESSAGE)
  const [replyTo, setReplyTo] = React.useState('')
  // Legacy modal starts empty; server falls back to "Invoice Details" when blank.
  const [fileName, setFileName] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [auditOpen, setAuditOpen] = React.useState(false)

  const providerLabel =
    user?.providerName?.trim() || user?.dealerName?.trim() || t('invoices.actionEmailProviderFallback')

  const showPriorSendPanel = sended === 1 && Boolean(emailsSended?.trim())
  const accountOptions = sentAccounts.data ?? []
  const showAccountCombo = accountOptions.length > 0

  React.useEffect(() => {
    if (!open) return

    // Legacy sendmail() modal: do NOT load active email-queue draft (that only
    // happens on "Create File to Email"). Prefill from localStorage only —
    // after a successful send legacy clears asunto/message and keeps replyto.
    const prefs = loadInvoiceEmailPrefs()
    setEmailTo('')
    setFileName('')
    setSubject(prefs.subject)
    setMessage(prefs.message || DEFAULT_INVOICE_EMAIL_MESSAGE)
    setReplyTo(prefs.replyTo)
    setError(null)
  }, [open, statementId])

  const handleAccountPick = React.useCallback((email: string) => {
    setEmailTo((current) => appendEmailToField(current, email))
  }, [])

  const handleSend = async () => {
    if (!statementId || !idDealer) return
    if (!isValidEmailList(emailTo)) {
      setError(t('invoices.actionEmailInvalid'))
      return
    }

    setError(null)
    try {
      await sendEmail.mutateAsync({
        idsInvoice: String(statementId),
        idDealer,
        emailto: emailTo.trim(),
        payed: payedFilter,
        subject: subject.trim(),
        message: message.trim(),
        replyto: replyTo.trim(),
        fileName: fileName.trim(),
      })
      persistInvoiceEmailPrefsAfterSend(replyTo)
      toast({
        title: t('invoices.actionEmailSuccess'),
        description: emailTo.trim(),
      })
      onOpenChange(false)
    } catch (err) {
      setError(getSrsErrorMessage(err, t('invoices.actionEmailError')))
    }
  }

  const handleAddToQueue = async () => {
    if (!statementId) return
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
      await addToQueue.mutateAsync({
        idsInvoices: String(statementId),
        idDealer,
        emailto: emailTo.trim() || undefined,
        payed: payedFilter,
        subject: subject.trim(),
        message: message.trim(),
        replyto: replyTo.trim(),
        fileName: fileName.trim(),
        queuename: queuePanel.queueName.trim(),
      })
      toast({ title: t('invoices.emailQueueSuccess') })
      onOpenChange(false)
    } catch (err) {
      setError(getSrsErrorMessage(err, t('invoices.emailQueueError')))
    }
  }

  const busy = sendEmail.isPending || addToQueue.isPending
  const loadingAccounts = open && sentAccounts.isLoading

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* Tall form: cap the height and scroll the fields so the footer buttons
            always stay on screen. Wider than the default so the four actions fit
            on one row instead of wrapping. */}
        <DialogContent className="flex max-h-[90dvh] flex-col gap-4 overflow-hidden sm:max-w-xl">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-base">{t('invoices.actionEmailTitle')}</DialogTitle>
            <DialogDescription className="text-xs tabular-nums">
              {invoiceLabel}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-1 pr-1">
            {showPriorSendPanel ? (
              <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs">
                <p className="font-medium text-foreground">
                  {t('invoices.actionEmailPriorSentTo', { invoice: invoiceLabel })}
                </p>
                <p className="mt-1 text-muted-foreground">{emailsSended?.replace(/,/g, ', ')}</p>
                <p className="mt-2 font-medium text-foreground">{t('invoices.actionEmailPriorLastDate')}</p>
                <p className="text-muted-foreground">{formatInvoiceEmailDate(lastSended)}</p>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="inv-email-to">{t('invoices.actionEmailTo')}</Label>
              <Input
                id="inv-email-to"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder={t('invoices.actionEmailToPlaceholder')}
                autoComplete="email"
                disabled={busy || loadingAccounts}
              />
              <p className="text-[11px] text-muted-foreground">{t('invoices.actionEmailToHint')}</p>
            </div>

            {showAccountCombo ? (
              <div className="space-y-1.5">
                <Label htmlFor="inv-email-account-pick">{t('invoices.actionEmailLastAccount')}</Label>
                <SentEmailAccountCombobox
                  key={open ? `email-accounts-${statementId ?? 0}` : 'email-accounts-closed'}
                  accounts={accountOptions}
                  onPick={handleAccountPick}
                  isLoading={sentAccounts.isLoading}
                  disabled={busy || loadingAccounts}
                />
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="inv-email-file-name">{t('invoices.actionEmailFileName')}</Label>
              <Input
                id="inv-email-file-name"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder={t('invoices.actionEmailFileNamePlaceholder')}
                disabled={busy || loadingAccounts}
              />
              <p className="text-[11px] text-muted-foreground">{t('invoices.actionEmailFileNameHint')}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-email-subject">{t('invoices.actionEmailSubject')}</Label>
              <Input
                id="inv-email-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t('invoices.actionEmailSubjectPlaceholder')}
                disabled={busy || loadingAccounts}
              />
              <p className="text-[11px] text-muted-foreground">
                {t('invoices.actionEmailSubjectDefaultHint', { provider: providerLabel })}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-email-message">{t('invoices.actionEmailMessage')}</Label>
              <Textarea
                id="inv-email-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('invoices.actionEmailMessagePlaceholder')}
                rows={4}
                className="text-sm"
                disabled={busy || loadingAccounts}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-email-reply">{t('invoices.actionEmailReply')}</Label>
              <Input
                id="inv-email-reply"
                type="email"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                placeholder={t('invoices.actionEmailReplyPlaceholder')}
                disabled={busy || loadingAccounts}
              />
            </div>

            <InvoiceEmailQueueFields
              open={open}
              queueName={queuePanel.queueName}
              onQueueNameChange={queuePanel.setQueueName}
              hasActiveQueue={queuePanel.hasActiveQueue}
              activeQueueLabel={queuePanel.draft?.descripcion}
              isLoading={queuePanel.isLoading}
              disabled={busy}
              className="border-t-0 pt-1"
            />

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>

          <DialogFooter className={cn('shrink-0 gap-2 sm:justify-between')}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mr-auto"
              disabled={!statementId}
              onClick={() => setAuditOpen(true)}
            >
              <History />
              {t('invoices.actionEmailAuditTitle')}
            </Button>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                <X />
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleAddToQueue()}
                disabled={busy || loadingAccounts || !statementId}
              >
                {addToQueue.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Inbox className="mr-2 h-4 w-4" />
                )}
                {t('invoices.emailQueueAdd')}
              </Button>
              <Button
                type="button"
                onClick={() => void handleSend()}
                disabled={busy || loadingAccounts || !emailTo.trim()}
              >
                {sendEmail.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                {t('invoices.actionEmailSend')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InvoiceStatementEmailAuditDialog
        open={auditOpen}
        onOpenChange={setAuditOpen}
        statementId={statementId}
        invoiceLabel={invoiceLabel}
      />
    </>
  )
}
