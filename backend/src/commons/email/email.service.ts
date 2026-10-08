import { hostname } from 'os'
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'

import { EMAIL_CONFIG, EmailConfig, EmailSenderConfig } from './email.config'
import { DEFAULT_EMAIL_SENDER, EMAIL_SENDER_KEYS, EmailSenderKey, isEmailSenderKey } from './email.senders'
import { EmailTemplateRenderer } from './email.templates'
import { EMAIL_TRANSPORTER, EmailTransporter } from './email.transport'
import {
  EMAIL_ADDRESS_RE,
  EMAIL_MAX_ATTACHMENTS_BYTES,
  EmailAddress,
  EmailMode,
  EmailRequestError,
  SendEmailRequest,
  SendEmailResult,
} from './email.types'

const PURPOSE_RE = /^[a-z][a-z0-9-]{1,39}$/

interface NormalizedAddress {
  address: string
  name?: string
}

/**
 * La única puerta de salida de mails del Nest (regla nest-email-module.mdc; plans/plan-nest-email
 * §8.2). `send()` valida (tira EmailRequestError por errores del que llama), renderiza, aplica el
 * modo, manda, loguea una línea y devuelve. Un fallo de transporte nunca tira: `status: 'failed'`.
 */
@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger('Email')

  constructor(
    @Inject(EMAIL_CONFIG) private readonly config: EmailConfig,
    @Inject(EMAIL_TRANSPORTER) private readonly transporter: EmailTransporter | null,
    private readonly templates: EmailTemplateRenderer,
  ) {}

  /** Una línea de arranque (sin clave); en PROD fuera de `live`, `error`. Nunca tira. */
  onModuleInit(): void {
    const { mode, isProd, problems } = this.config
    const line = `email: ${this.describe()}`
    if (isProd && mode !== 'live') this.logger.error(`${line} — en producción el email no está en modo live`)
    else this.logger.log(line)
    for (const p of problems) {
      if (isProd) this.logger.error(`email: ${p}`)
      else this.logger.warn(`email: ${p}`)
    }
    if (this.templates.names().length === 0) {
      this.logger.error(`email: no hay plantillas en ${this.config.templatesDir} (¿se copiaron a dist? nest-cli.json assets)`)
    }
    for (const b of this.templates.precompileAll()) this.logger.error(`email: plantilla '${b.name}' rota: ${b.error}`)
  }

  get status(): { mode: EmailMode; problems: string[]; senders: EmailSenderKey[] } {
    return {
      mode: this.config.mode,
      problems: [...this.config.problems],
      senders: EMAIL_SENDER_KEYS.filter((k) => !!this.config.senders[k]),
    }
  }

  async send(req: SendEmailRequest): Promise<SendEmailResult> {
    const started = Date.now()
    const { mode } = this.config

    // 1. Validación: errores de programación, tiran en los cuatro modos.
    if (!req || typeof req.purpose !== 'string' || !PURPOSE_RE.test(req.purpose)) {
      throw new EmailRequestError(`invalid purpose "${req?.purpose}" (^[a-z][a-z0-9-]{1,39}$)`)
    }
    if (req.audience !== 'internal' && req.audience !== 'client') {
      throw new EmailRequestError(`invalid audience "${req.audience}" ('internal' | 'client')`)
    }
    if (req.audience === 'client') {
      // Decisión 4 (06/10/2026): hasta tener la lista negra y EMAIL_SENDED (nest-email-sending.mdc §7).
      throw new EmailRequestError("audience 'client' is not allowed yet (no email blacklist in the Nest)")
    }
    const sender = req.sender ?? DEFAULT_EMAIL_SENDER
    if (!isEmailSenderKey(sender)) throw new EmailRequestError(`unknown sender "${sender}"`)
    const subject = typeof req.subject === 'string' ? req.subject.replace(/[\r\n]+/g, ' ').trim() : ''
    if (!subject) throw new EmailRequestError('subject is required')

    const to = normalizeAddresses(req.to, 'to')
    if (to.length === 0) throw new EmailRequestError('at least one valid "to" recipient is required')
    const taken = new Set(to.map((a) => a.address))
    const cc = normalizeAddresses(req.cc, 'cc').filter((a) => !taken.has(a.address))
    cc.forEach((a) => taken.add(a.address))
    const bcc = normalizeAddresses(req.bcc, 'bcc').filter((a) => !taken.has(a.address))
    const replyTo = req.replyTo === undefined ? undefined : normalizeAddresses(req.replyTo, 'replyTo')[0]

    if (req.template && req.html !== undefined) throw new EmailRequestError('use template or html, not both')
    if (req.html !== undefined && !req.text) throw new EmailRequestError('text is required with html (plain text always)')
    if (!req.template && !req.html && !req.text) throw new EmailRequestError('the email has no body (template, html+text or text)')
    const attachments = req.attachments ?? []
    let attachmentsBytes = 0
    for (const a of attachments) {
      if (!a || !a.filename || !a.contentType || a.content === undefined || a.content === null) {
        throw new EmailRequestError('every attachment needs filename, content and contentType')
      }
      attachmentsBytes += Buffer.isBuffer(a.content) ? a.content.length : Buffer.byteLength(String(a.content))
    }
    if (attachmentsBytes > EMAIL_MAX_ATTACHMENTS_BYTES) {
      throw new EmailRequestError(`attachments exceed ${EMAIL_MAX_ATTACHMENTS_BYTES} bytes (${attachmentsBytes})`)
    }

    // 2. Render: también en suppressed/disabled, para que una plantilla rota se vea en dev.
    let html = req.html
    let text = req.text
    if (req.template) {
      const rendered = this.templates.render(req.template.name, { ...req.template.context, subject })
      html = rendered.html
      text = rendered.text
    }

    const originals = [...to, ...cc, ...bcc].map((a) => a.address)
    const base = { mode, purpose: req.purpose, sender, subject }
    const finish = (r: Omit<SendEmailResult, 'durationMs' | keyof typeof base>): SendEmailResult => {
      const result: SendEmailResult = { ...base, ...r, durationMs: Date.now() - started }
      this.logResult(result, req.audience)
      return result
    }

    // 3. Modo.
    if (mode === 'suppressed') {
      return finish({ status: 'suppressed', to: originals, reason: this.config.suppressedReason ?? 'suppressed' })
    }
    if (mode === 'disabled') {
      return finish({ status: 'failed', to: originals, error: `email disabled: ${this.config.problems.join('; ')}` })
    }
    const from: EmailSenderConfig | undefined = this.config.senders[sender]
    if (!from) return finish({ status: 'failed', to: originals, error: `sender '${sender}' is not configured` })
    if (!this.transporter) return finish({ status: 'failed', to: originals, error: 'email transport not available' })

    const redirect = mode === 'redirect'
    const redirectTo = this.config.redirectTo!
    const headers: Record<string, string> = { 'X-SRS-Purpose': req.purpose }
    if (redirect) {
      headers['X-SRS-Original-To'] = [
        `to: ${to.map((a) => a.address).join(', ')}`,
        cc.length ? `cc: ${cc.map((a) => a.address).join(', ')}` : '',
        bcc.length ? `bcc: ${bcc.map((a) => a.address).join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('; ')
    }
    const effectiveTo = redirect ? [redirectTo] : to.map((a) => a.address)

    // 4. Envío: un intento, sin reintentos (nest-email-sending.mdc §5).
    try {
      const info = await this.transporter.sendMail({
        from: { name: from.name, address: from.address },
        to: redirect ? [redirectTo] : toMailAddresses(to),
        cc: redirect || !cc.length ? undefined : toMailAddresses(cc),
        bcc: redirect || !bcc.length ? undefined : toMailAddresses(bcc),
        replyTo: replyTo ? toMailAddresses([replyTo])[0] : undefined,
        subject: redirect ? `[DEV → ${originals.join(', ')}] ${subject}` : subject,
        text,
        html,
        attachments: attachments.length
          ? attachments.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType }))
          : undefined,
        headers,
      })
      return finish({
        status: 'sent',
        to: effectiveTo,
        ...(redirect ? { redirectedFrom: originals } : {}),
        messageId: info?.messageId,
      })
    } catch (e) {
      return finish({
        status: 'failed',
        to: effectiveTo,
        ...(redirect ? { redirectedFrom: originals } : {}),
        error: this.redact(e),
      })
    }
  }

  /** Handshake SMTP sin mandar nada (CLI). */
  async verify(): Promise<{ ok: boolean; mode: EmailMode; error?: string }> {
    const { mode } = this.config
    if (mode === 'suppressed') return { ok: false, mode, error: `email suppressed: ${this.config.suppressedReason}` }
    if (mode === 'disabled') return { ok: false, mode, error: `email disabled: ${this.config.problems.join('; ')}` }
    if (!this.transporter) return { ok: false, mode, error: 'email transport not available' }
    try {
      await this.transporter.verify()
      return { ok: true, mode }
    } catch (e) {
      return { ok: false, mode, error: this.redact(e) }
    }
  }

  /** Mensaje del error sin stack y sin la clave (aunque el transporte la incluya). */
  private redact(e: unknown): string {
    const err = e as { message?: unknown; code?: unknown; responseCode?: unknown }
    let msg = typeof err?.message === 'string' ? err.message : String(e)
    if (typeof err?.code === 'string' && msg.indexOf(err.code) < 0) msg = `${err.code}: ${msg}`
    const pass = this.config.smtp?.pass
    if (pass) msg = msg.split(pass).join('***')
    return msg.replace(/\s+/g, ' ').trim().slice(0, 500)
  }

  private describe(): string {
    const { mode, smtp, redirectTo, suppressedReason } = this.config
    const from = this.config.senders[DEFAULT_EMAIL_SENDER]
    const parts = [`mode=${mode}`]
    if (smtp) parts.push(`host=${smtp.host}:${smtp.port}`, `user=${smtp.user.slice(0, 2)}***`)
    if (from) parts.push(`from="${from.name} <${from.address}>"`)
    if (mode === 'redirect') parts.push(`redirectTo=${redirectTo}`)
    if (mode === 'live') parts.push(`hostname=${hostname()}`)
    if (mode === 'suppressed') parts.push(`reason="${suppressedReason}"`)
    return parts.join(' ')
  }

  /** Una línea por envío; nunca el cuerpo, los adjuntos ni la clave. */
  private logResult(r: SendEmailResult, audience: string): void {
    const parts = [
      `email purpose=${r.purpose}`,
      `audience=${audience}`,
      `status=${r.status}`,
      `mode=${r.mode}`,
      `sender=${r.sender}`,
      `to=${r.to.join(',')}`,
    ]
    if (r.redirectedFrom) parts.push(`redirectedFrom=${r.redirectedFrom.join(',')}`)
    parts.push(`subject=${JSON.stringify(r.subject)}`)
    if (r.messageId) parts.push(`id=${r.messageId}`)
    if (r.reason) parts.push(`reason=${JSON.stringify(r.reason)}`)
    if (r.error) parts.push(`error=${JSON.stringify(r.error)}`)
    parts.push(`${r.durationMs}ms`)
    const line = parts.join(' ')
    if (r.status === 'failed' || (this.config.isProd && r.mode === 'redirect')) this.logger.error(line)
    else this.logger.log(line)
  }
}

function toMailAddresses(list: NormalizedAddress[]): Array<{ name: string; address: string }> {
  return list.map((a) => ({ name: a.name ?? '', address: a.address }))
}

/** Trim, minúsculas, sin duplicados, regex mínima. Una dirección inválida tira. */
function normalizeAddresses(value: EmailAddress | EmailAddress[] | undefined, field: string): NormalizedAddress[] {
  if (value === undefined || value === null) return []
  const list = Array.isArray(value) ? value : [value]
  const out: NormalizedAddress[] = []
  const seen = new Set<string>()
  for (const item of list) {
    const raw = typeof item === 'string' ? { address: item } : item
    const address = typeof raw?.address === 'string' ? raw.address.trim().toLowerCase() : ''
    if (!EMAIL_ADDRESS_RE.test(address)) throw new EmailRequestError(`invalid "${field}" address "${address}"`)
    if (seen.has(address)) continue
    seen.add(address)
    const name = typeof raw.name === 'string' ? raw.name.replace(/[\r\n"]+/g, ' ').trim() : ''
    out.push(name ? { address, name } : { address })
  }
  return out
}
