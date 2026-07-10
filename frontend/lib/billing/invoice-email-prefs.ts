/** Legacy localStorage keys (billing invoice send email modal). */
const LS_SUBJECT = 'asunto'
const LS_MESSAGE = 'message'
const LS_REPLY_TO = 'replyto'

export const DEFAULT_INVOICE_EMAIL_MESSAGE =
  'Your current billing statements are linked below.  Please let us know if you have any questions.'

export type InvoiceEmailPrefs = {
  subject: string
  message: string
  replyTo: string
}

function readStorage(key: string): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // ignore quota / private mode
  }
}

/** Load persisted fields (legacy parity). */
export function loadInvoiceEmailPrefs(): InvoiceEmailPrefs {
  const storedMessage = readStorage(LS_MESSAGE)
  return {
    subject: readStorage(LS_SUBJECT),
    message: storedMessage.trim() !== '' ? storedMessage : DEFAULT_INVOICE_EMAIL_MESSAGE,
    replyTo: readStorage(LS_REPLY_TO),
  }
}

/** After successful send: clear subject/message, keep reply-to (legacy doSendMail2). */
export function persistInvoiceEmailPrefsAfterSend(replyTo: string): void {
  writeStorage(LS_SUBJECT, '')
  writeStorage(LS_MESSAGE, '')
  writeStorage(LS_REPLY_TO, replyTo.trim())
}
