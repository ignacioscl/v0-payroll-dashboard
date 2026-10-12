'use client'

import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FileSpreadsheet, List, Mail, Plus, Rows3 } from 'lucide-react'

import {
  BillingActionDialog,
  BillingActionSection,
  BillingOptionTile,
  BillingToggleRow,
} from '@/components/billing/billing-action-dialog'
import { SentEmailAccountCombobox } from '@/components/billing/sent-email-account-combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  invoiceEmailActiveQueueQueryKey,
  useInvoiceEmailActiveQueue,
} from '@/hooks/use-invoice-email-active-queue'
import type { InvoiceListInput } from '@/hooks/use-invoice-list'
import { useInvoiceSentEmailAccounts } from '@/hooks/use-invoice-sent-email-accounts'
import { useToast } from '@/hooks/use-toast'
import {
  DEFAULT_INVOICE_EMAIL_MESSAGE,
  loadInvoiceEmailPrefs,
  persistInvoiceEmailPrefsAfterSend,
} from '@/lib/billing/invoice-email-prefs'
import { appendEmailToField } from '@/lib/billing/invoice-email-ui'
import { useTranslation } from '@/lib/i18n/locale-context'
import { DB_POOL_BUSY, isSrsBusyError } from '@/lib/srs-busy-error'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import {
  fetchInvoiceExportMail,
  fetchInvoiceExportPrepare,
  fetchInvoiceExportStatus,
  INVOICE_EXPORT_DOWNLOAD_PATH,
  type InvoiceExportTicketStatus,
  type InvoiceXlsExportType,
} from '@/lib/srs-invoices-api'
import { startTicketDownload } from '@/lib/ttk/ticket-download'

/** Lengths of the EMAIL_* columns (D22). */
const MAX_EMAIL = 64
const MAX_NAME = 64
const MAX_SUBJECT = 512
const MAX_MESSAGE = 1024
const POLL_MS = 800
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type ExportAction = 'export' | 'email' | 'queue'
type FieldErrors = Partial<Record<'emailTo' | 'replyTo' | 'queueName' | 'fileName' | 'subject' | 'message', string>>

/** Email To → addresses, or the error key (D15, D22). */
function checkEmailList(raw: string): 'required' | 'invalid' | 'long' | null {
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return 'required'
  if (parts.some((p) => !EMAIL_RE.test(p))) return 'invalid'
  if (parts.some((p) => p.length > MAX_EMAIL)) return 'long'
  return null
}

/**
 * "Generate Xls Report" of Billing → Invoices (plans/plan-export-invoices-nest §1.3, §1.4, §8.7).
 * Every action exports every invoice of the list with the grid's filters — the same `input` the
 * grid uses — without selecting anything. Nest builds the XLSX with one function for the three:
 * Export downloads it; Send Email and Create File to Email hand that same file to the PHP, which
 * builds the email queue and, for Send Email, sends it.
 */
export function InvoiceExportDialog({
  open,
  onOpenChange,
  input,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Same input as the grid. null = the list is not ready (no dealer or dates). */
  input: InvoiceListInput | null
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [exportType, setExportType] = React.useState<InvoiceXlsExportType>(1)
  const [action, setAction] = React.useState<ExportAction>('export')
  const [fileName, setFileName] = React.useState('')
  const [emailTo, setEmailTo] = React.useState('')
  const [subject, setSubject] = React.useState('')
  const [message, setMessage] = React.useState(DEFAULT_INVOICE_EMAIL_MESSAGE)
  const [replyTo, setReplyTo] = React.useState('')
  const [queueName, setQueueName] = React.useState('')
  const [attachTimeCard, setAttachTimeCard] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({})
  const pollRef = React.useRef<number | null>(null)

  const isMail = action !== 'export'
  const activeQueue = useInvoiceEmailActiveQueue(open && action === 'queue')
  // Legacy getEmails.php is called without dealer: every address the author sent to (§2.3).
  const sentAccounts = useInvoiceSentEmailAccounts('', open && isMail)
  const accountOptions = sentAccounts.data ?? []

  // D16: the Time Card box shows when the "Invoice types" filter includes Time Tracking.
  const types = (input?.types ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const showTimeCard = isMail && (types.length === 0 || types.includes('ttk'))

  const stopPoll = React.useCallback(() => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  React.useEffect(() => {
    if (!open) return
    const prefs = loadInvoiceEmailPrefs()
    setExportType(1)
    setAction('export')
    setFileName('')
    setEmailTo('')
    setSubject(prefs.subject)
    // The default message, as the legacy modal (§2.3): localStorage is not read for it.
    setMessage(DEFAULT_INVOICE_EMAIL_MESSAGE)
    setReplyTo(prefs.replyTo)
    setQueueName('')
    setAttachTimeCard(false)
    setPending(false)
    setError(null)
    setFieldErrors({})
  }, [open])

  React.useEffect(() => {
    if (!open) stopPoll()
  }, [open, stopPoll])
  React.useEffect(() => () => stopPoll(), [stopPoll])

  // D13: Create File with an active queue preloads its fields; Send Email starts from the prefs.
  const draft = activeQueue.data
  React.useEffect(() => {
    if (!open) return
    const prefs = loadInvoiceEmailPrefs()
    if (action === 'queue' && draft) {
      setQueueName(draft.descripcion ?? '')
      setEmailTo((draft.emails ?? []).join(', '))
      setSubject(draft.asunto ?? '')
      setMessage(draft.message || DEFAULT_INVOICE_EMAIL_MESSAGE)
      setReplyTo(draft.replyTo ?? '')
    } else if (action === 'email') {
      setQueueName('')
      setEmailTo('')
      setSubject(prefs.subject)
      setMessage(DEFAULT_INVOICE_EMAIL_MESSAGE)
      setReplyTo(prefs.replyTo)
    }
    setFieldErrors({})
    setError(null)
  }, [open, action, draft])

  const statusMessage = (status: InvoiceExportTicketStatus) =>
    status.errorCode === DB_POOL_BUSY
      ? t('common.serverBusy')
      : status.errorMessage || t('common.exportFailed')

  const failWith = (e: unknown) => {
    stopPoll()
    setPending(false)
    setError(isSrsBusyError(e) ? t('common.serverBusy') : getSrsErrorMessage(e, t('common.exportFailed')))
  }

  /** Polls the ticket until the job ends: `done` only when the PHP answered well (§8.7). */
  const watch = (ticket: string, onDone: (status: InvoiceExportTicketStatus) => void) => {
    const pollOnce = () => {
      void fetchInvoiceExportStatus(ticket)
        .then((status) => {
          if (status.status === 'done') {
            stopPoll()
            setPending(false)
            onDone(status)
          } else if (status.status === 'error') {
            stopPoll()
            setPending(false)
            setError(statusMessage(status))
          }
        })
        .catch((e) => {
          // A network blip while polling is not a failed job: try again on the next tick.
          if (e instanceof TypeError) return
          failWith(e)
        })
    }
    pollRef.current = window.setInterval(pollOnce, POLL_MS)
  }

  const validate = (): boolean => {
    const next: FieldErrors = {}
    if (fileName.trim().length > MAX_NAME) next.fileName = t('invoices.exportXlsMaxChars', { n: MAX_NAME })
    if (isMail) {
      const emails = checkEmailList(emailTo)
      if (emails === 'required') next.emailTo = t('invoices.exportXlsRequired')
      else if (emails === 'invalid') next.emailTo = t('invoices.exportXlsInvalidEmails')
      else if (emails === 'long') next.emailTo = t('invoices.exportXlsMaxChars', { n: MAX_EMAIL })
      const reply = replyTo.trim()
      if (reply && !EMAIL_RE.test(reply)) next.replyTo = t('invoices.exportXlsInvalidEmail')
      else if (reply.length > MAX_EMAIL) next.replyTo = t('invoices.exportXlsMaxChars', { n: MAX_EMAIL })
      if (subject.length > MAX_SUBJECT) next.subject = t('invoices.exportXlsMaxChars', { n: MAX_SUBJECT })
      if (message.length > MAX_MESSAGE) next.message = t('invoices.exportXlsMaxChars', { n: MAX_MESSAGE })
      if (action === 'queue' && queueName.trim().length > MAX_NAME) {
        next.queueName = t('invoices.exportXlsMaxChars', { n: MAX_NAME })
      }
    }
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  const onConfirm = async () => {
    if (!input || pending) return
    if (!validate()) return
    setError(null)
    setPending(true)
    try {
      if (action === 'export') {
        const prepared = await fetchInvoiceExportPrepare(input, {
          exportType,
          fileName: fileName.trim() || undefined,
        })
        // Export has no success toast, like legacy (D18): the file is the confirmation.
        watch(prepared.ticket, () => onOpenChange(false))
        startTicketDownload(INVOICE_EXPORT_DOWNLOAD_PATH, prepared.ticket)
        return
      }
      const started = await fetchInvoiceExportMail(input, action, {
        exportType,
        fileName: fileName.trim() || undefined,
        emailTo: emailTo.trim(),
        subject,
        message,
        replyTo: replyTo.trim(),
        queueName: action === 'queue' ? queueName.trim() : undefined,
        attachTimeCard: showTimeCard && attachTimeCard,
      })
      watch(started.ticket, () => {
        // Legacy clears subject and message and keeps reply-to after both actions (§1.4).
        try {
          persistInvoiceEmailPrefsAfterSend(replyTo)
        } catch {
          /* ignore */
        }
        void queryClient.invalidateQueries({ queryKey: invoiceEmailActiveQueueQueryKey() })
        toast({ title: action === 'email' ? t('invoices.exportXlsSent') : t('invoices.exportXlsQueued') })
        onOpenChange(false)
      })
    } catch (e) {
      failWith(e)
    }
  }

  const confirmLabel =
    action === 'export'
      ? t('invoices.exportXlsExport')
      : action === 'email'
        ? t('invoices.exportXlsActionSend')
        : t('invoices.exportXlsActionQueue')
  const confirmIcon = action === 'export' ? FileSpreadsheet : action === 'email' ? Mail : Plus

  const fieldError = (key: keyof FieldErrors) =>
    fieldErrors[key] ? <p className="text-[11px] text-destructive">{fieldErrors[key]}</p> : null

  return (
    <BillingActionDialog
      open={open}
      onOpenChange={onOpenChange}
      tone="emerald"
      icon={FileSpreadsheet}
      title={t('invoices.exportXlsTitle')}
      subtitle={t('invoices.exportXlsSubtitle')}
      cancelLabel={t('common.cancel')}
      confirmLabel={confirmLabel}
      confirmIcon={confirmIcon}
      onConfirm={() => void onConfirm()}
      pending={pending}
      confirmDisabled={!input}
      className="sm:max-w-lg"
    >
      <BillingActionSection title={t('invoices.exportXlsVisualization')}>
        <div className="grid gap-1.5 sm:grid-cols-2">
          <BillingOptionTile
            selected={exportType === 1}
            onSelect={() => setExportType(1)}
            title={t('invoices.exportXlsTypeInvoice')}
            icon={List}
            disabled={pending}
          />
          <BillingOptionTile
            selected={exportType === 2}
            onSelect={() => setExportType(2)}
            title={t('invoices.exportXlsTypeWo')}
            icon={Rows3}
            disabled={pending}
          />
        </div>
      </BillingActionSection>

      <BillingActionSection title={t('invoices.exportXlsAction')}>
        <div className="grid gap-1.5 sm:grid-cols-3">
          <BillingOptionTile
            selected={action === 'export'}
            onSelect={() => setAction('export')}
            title={t('invoices.exportXlsExport')}
            icon={FileSpreadsheet}
            disabled={pending}
          />
          <BillingOptionTile
            selected={action === 'email'}
            onSelect={() => setAction('email')}
            title={t('invoices.exportXlsActionSend')}
            icon={Mail}
            disabled={pending}
          />
          <BillingOptionTile
            selected={action === 'queue'}
            onSelect={() => setAction('queue')}
            title={t('invoices.exportXlsActionQueue')}
            icon={Plus}
            disabled={pending}
          />
        </div>
      </BillingActionSection>

      {isMail ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="inv-export-email-to">{t('invoices.exportXlsEmailTo')}</Label>
            <Input
              id="inv-export-email-to"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              placeholder={t('invoices.exportXlsEmailTo')}
              autoComplete="email"
              disabled={pending}
            />
            <p className="text-[11px] text-muted-foreground">{t('invoices.exportXlsEmailToHint')}</p>
            {fieldError('emailTo')}
          </div>

          {accountOptions.length > 0 ? (
            <div className="space-y-1.5">
              <Label>{t('invoices.exportXlsLastAccount')}</Label>
              <SentEmailAccountCombobox
                key={open ? `export-email-accounts-${action}` : 'export-email-accounts-closed'}
                accounts={accountOptions}
                onPick={(email) => setEmailTo((cur) => appendEmailToField(cur, email))}
                isLoading={sentAccounts.isLoading}
                disabled={pending}
              />
            </div>
          ) : null}

          {action === 'queue' ? (
            <div className="space-y-1.5">
              <Label htmlFor="inv-export-queue-name">{t('invoices.exportXlsQueueName')}</Label>
              <Input
                id="inv-export-queue-name"
                value={queueName}
                onChange={(e) => setQueueName(e.target.value)}
                placeholder={t('invoices.exportXlsQueueName')}
                disabled={pending}
              />
              <p className="text-[11px] text-muted-foreground">{t('invoices.exportXlsQueueNameHint')}</p>
              {fieldError('queueName')}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="inv-export-filename">{t('invoices.exportXlsFileName')}</Label>
        <Input
          id="inv-export-filename"
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
          placeholder={t('invoices.exportXlsFileName')}
          disabled={pending}
        />
        <p className="text-[11px] text-muted-foreground">{t('invoices.exportXlsFileNameHint')}</p>
        {fieldError('fileName')}
      </div>

      {isMail ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="inv-export-subject">{t('invoices.exportXlsSubject')}</Label>
            <Input
              id="inv-export-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t('invoices.exportXlsSubject')}
              disabled={pending}
            />
            {fieldError('subject')}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-export-message">{t('invoices.exportXlsMessage')}</Label>
            <Textarea
              id="inv-export-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('invoices.exportXlsMessage')}
              rows={4}
              disabled={pending}
            />
            {fieldError('message')}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-export-reply-to">{t('invoices.exportXlsReplyTo')}</Label>
            <Input
              id="inv-export-reply-to"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder={t('invoices.exportXlsReplyTo')}
              disabled={pending}
            />
            {fieldError('replyTo')}
          </div>
          {showTimeCard ? (
            <BillingToggleRow
              checked={attachTimeCard}
              onCheckedChange={setAttachTimeCard}
              title={t('invoices.exportXlsTimeCard')}
              disabled={pending}
            />
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </BillingActionDialog>
  )
}
