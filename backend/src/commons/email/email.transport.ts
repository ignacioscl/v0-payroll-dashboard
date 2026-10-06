import { createTransport, SendMailOptions } from 'nodemailer'
import SMTPTransport from 'nodemailer/lib/smtp-transport'

import { EmailConfig, EmailSmtpConfig } from './email.config'

/**
 * Transporte SMTP del módulo (plans/plan-nest-email §8.5). Una sola instancia, creada por el
 * módulo; `null` en `suppressed` y `disabled` (ahí `send` no toca nodemailer).
 */
export const EMAIL_TRANSPORTER = Symbol('EMAIL_TRANSPORTER')

/** Lo mínimo que usa EmailService: lo cumple el Transporter de nodemailer y un stub de test. */
export interface EmailTransporter {
  sendMail(options: SendMailOptions): Promise<{ messageId?: string }>
  verify(): Promise<true>
}

/**
 * Opciones para SMTP2GO. Sin `rejectUnauthorized: false` (queda en su default: verifica el
 * certificado), sin `name: 'localhost'` ni `localAddress`. Timeouts cortos: el runner de jobs
 * espera la alerta y los defaults de nodemailer son 2 min / 10 min (smtp-connection/index.js:14-17).
 * El objeto con `auth.pass` enumerable existe solo acá adentro.
 */
export function buildTransportOptions(smtp: EmailSmtpConfig): SMTPTransport.Options & { pool: false } {
  return {
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: smtp.requireTLS,
    auth: { user: smtp.user, pass: smtp.pass },
    tls: { minVersion: 'TLSv1.2' },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    dnsTimeout: 10_000,
    // Un mail por conexión (nodemailer.js:39 elige SMTPPool solo con `pool` verdadero): volumen de alertas.
    pool: false,
    // Un html o un adjunto nunca apunta a una URL ni a un archivo del servidor.
    disableUrlAccess: true,
    disableFileAccess: true,
    logger: false,
    debug: false,
  }
}

export function createEmailTransporter(config: EmailConfig): EmailTransporter | null {
  if ((config.mode !== 'live' && config.mode !== 'redirect') || !config.smtp) return null
  return createTransport(buildTransportOptions(config.smtp))
}
