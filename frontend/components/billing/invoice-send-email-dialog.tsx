'use client'

import * as React from 'react'
import { Loader2, Mail } from 'lucide-react'

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
import { useToast } from '@/hooks/use-toast'
import { useSendInvoiceEmail } from '@/hooks/use-send-invoice-email'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import { useTranslation } from '@/lib/i18n/locale-context'

const DEFAULT_MESSAGE =
  'Your current billing statements are linked below.  Please let us know if you have any questions.'

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
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  statementId: number | null
  invoiceLabel: string
  idDealer: string
  payedFilter?: string
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const sendEmail = useSendInvoiceEmail()
  const [emailTo, setEmailTo] = React.useState('')
  const [subject, setSubject] = React.useState('')
  const [message, setMessage] = React.useState(DEFAULT_MESSAGE)
  const [replyTo, setReplyTo] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setEmailTo('')
    setSubject('')
    setMessage(DEFAULT_MESSAGE)
    setReplyTo('')
    setError(null)
  }, [open, statementId])

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
      })
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{t('invoices.actionEmailTitle')}</DialogTitle>
          <DialogDescription className="text-xs tabular-nums">
            {invoiceLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="inv-email-to">{t('invoices.actionEmailTo')}</Label>
            <Input
              id="inv-email-to"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              placeholder="billing@dealer.com"
              autoComplete="email"
              disabled={sending}
            />
            <p className="text-[11px] text-muted-foreground">{t('invoices.actionEmailToHint')}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-email-subject">{t('invoices.actionEmailSubject')}</Label>
            <Input
              id="inv-email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={sending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-email-message">{t('invoices.actionEmailMessage')}</Label>
            <Textarea
              id="inv-email-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="text-sm"
              disabled={sending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-email-reply">{t('invoices.actionEmailReply')}</Label>
            <Input
              id="inv-email-reply"
              type="email"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              disabled={sending}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => void handleSend()} disabled={sending || !emailTo.trim()}>
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
            {t('invoices.actionEmailSend')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
