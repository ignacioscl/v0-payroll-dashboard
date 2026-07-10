'use client'

import * as React from 'react'
import { Loader2, Mail } from 'lucide-react'

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
import { useInvoiceEmailActiveQueue } from '@/hooks/use-invoice-email-active-queue'
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
  DEFAULT_INVOICE_EMAIL_FILE_NAME,
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

function mergeDraftFields(
  prefs: ReturnType<typeof loadInvoiceEmailPrefs>,
  queue: { asunto?: string; message?: string; replyTo?: string } | null | undefined,
) {
  let subject = prefs.subject
  let message = prefs.message
  let replyTo = prefs.replyTo

  if (queue) {
    if (queue.asunto?.trim()) {
      subject = queue.asunto.trim()
    }
    if (queue.message != null && queue.message !== '') {
      message = queue.message
    }
    if (queue.replyTo?.trim()) {
      replyTo = queue.replyTo.trim()
    }
  }

  return { subject, message, replyTo }
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
  const activeQueue = useInvoiceEmailActiveQueue(open)
  const sentAccounts = useInvoiceSentEmailAccounts(idDealer, open)
  const [emailTo, setEmailTo] = React.useState('')
  const [subject, setSubject] = React.useState('')
  const [message, setMessage] = React.useState(DEFAULT_INVOICE_EMAIL_MESSAGE)
  const [replyTo, setReplyTo] = React.useState('')
  const [fileName, setFileName] = React.useState(DEFAULT_INVOICE_EMAIL_FILE_NAME)
  const [error, setError] = React.useState<string | null>(null)
  const [auditOpen, setAuditOpen] = React.useState(false)

  const providerLabel =
    user?.providerName?.trim() || user?.dealerName?.trim() || t('invoices.actionEmailProviderFallback')

  const showPriorSendPanel = sended === 1 && Boolean(emailsSended?.trim())
  const accountOptions = sentAccounts.data ?? []
  const showAccountCombo = accountOptions.length > 0

  React.useEffect(() => {
    if (!open) return
    setEmailTo('')
    setFileName(DEFAULT_INVOICE_EMAIL_FILE_NAME)
    setError(null)
  }, [open, statementId])

  React.useEffect(() => {
    if (!open || activeQueue.isLoading) return

    const prefs = loadInvoiceEmailPrefs()
    const merged = mergeDraftFields(prefs, activeQueue.data)
    setSubject(merged.subject)
    setMessage(merged.message || DEFAULT_INVOICE_EMAIL_MESSAGE)
    setReplyTo(merged.replyTo)
  }, [open, statementId, activeQueue.isLoading, activeQueue.data])

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

  const sending = sendEmail.isPending
  const loadingDraft = open && (activeQueue.isLoading || sentAccounts.isLoading)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">{t('invoices.actionEmailTitle')}</DialogTitle>
            <DialogDescription className="text-xs tabular-nums">
              {invoiceLabel}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
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
                disabled={sending || loadingDraft}
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
                  disabled={sending || loadingDraft}
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
                disabled={sending || loadingDraft}
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
                disabled={sending || loadingDraft}
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
                disabled={sending || loadingDraft}
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
                disabled={sending || loadingDraft}
              />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>

          <DialogFooter className={cn('gap-2 sm:justify-between')}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mr-auto"
              disabled={!statementId}
              onClick={() => setAuditOpen(true)}
            >
              {t('invoices.actionEmailAuditTitle')}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                onClick={() => void handleSend()}
                disabled={sending || loadingDraft || !emailTo.trim()}
              >
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
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
