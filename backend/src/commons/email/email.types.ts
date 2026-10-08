import { EmailSenderKey } from './email.senders'

/** Qué hace el módulo con un `send` (plans/plan-nest-email §8.4; lo decide `loadEmailConfig`). */
export type EmailMode = 'live' | 'redirect' | 'suppressed' | 'disabled'

/** `internal` = lo lee gente de SRS; `client` = un dealer o un cliente (rechazado hasta la lista negra). */
export type EmailAudience = 'internal' | 'client'

export type EmailAddress = string | { address: string; name?: string }

export interface EmailAttachment {
  filename: string
  content: Buffer | string
  contentType: string
}

/** `name` = ruta relativa en `templates/` sin extensión ('test' → test.hbs + test.txt.hbs). */
export interface EmailTemplateRef {
  name: string
  context: Record<string, unknown>
}

export interface SendEmailRequest {
  /** ^[a-z][a-z0-9-]{1,39}$ ('job-alert', 'email-smoke-test'): etiqueta del log y cabecera X-SRS-Purpose. */
  purpose: string
  audience: EmailAudience
  to: EmailAddress | EmailAddress[]
  cc?: EmailAddress | EmailAddress[]
  bcc?: EmailAddress | EmailAddress[]
  replyTo?: EmailAddress
  subject: string
  /** O bien `template`, o bien `html` + `text` (o solo `text`); nunca `template` y `html` juntos. */
  template?: EmailTemplateRef
  html?: string
  /** Texto plano: obligatorio con `html`. */
  text?: string
  /** Tope: EMAIL_MAX_ATTACHMENTS_BYTES sumados. */
  attachments?: EmailAttachment[]
  /** Default 'srs'. */
  sender?: EmailSenderKey
}

export type SendEmailStatus = 'sent' | 'suppressed' | 'failed'

export interface SendEmailResult {
  status: SendEmailStatus
  mode: EmailMode
  purpose: string
  sender: EmailSenderKey
  subject: string
  /** Destinatarios efectivos (en `redirect`: la casilla de dev). */
  to: string[]
  /** Solo en `redirect`: los originales (to + cc + bcc). */
  redirectedFrom?: string[]
  /** Solo `sent`. */
  messageId?: string
  /** Solo `suppressed`. */
  reason?: string
  /** Solo `failed`: mensaje sin stack ni clave. */
  error?: string
  durationMs: number
}

/** Error de programación del que llama (pedido inválido). Se tira en los cuatro modos. */
export class EmailRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmailRequestError'
  }
}

/** Tope de adjuntos sumados por mail (10 MB). */
export const EMAIL_MAX_ATTACHMENTS_BYTES = 10 * 1024 * 1024

/** Una dirección simple (sin nombre ni `<>`), con dominio con punto. Regex mínima a propósito. */
export const EMAIL_ADDRESS_RE = /^[^\s@<>,;"']+@[^\s@<>,;"']+\.[^\s@<>,;"']+$/
