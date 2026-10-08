import {
  DEFAULT_EMAIL_FROM_NAME,
  DEFAULT_EMAIL_SENDER,
  EMAIL_SENDER_ENV,
  EMAIL_SENDER_KEYS,
  EmailSenderKey,
} from './email.senders'
import { EMAIL_ADDRESS_RE, EmailMode } from './email.types'

/**
 * Configuración del módulo de email (plans/plan-nest-email §8.4 y §8.5). Este es el ÚNICO archivo
 * que lee las variables `EMAIL_*` (regla nest-email-module.mdc). `loadEmailConfig` es pura y no
 * tira: con configuración mala en PROD el módulo queda `disabled` (el boot nunca se cae por el
 * mail) y los problemas se loguean al arrancar.
 *
 * Invariante: un mail llega a un destinatario real solo con NODE_ENV=production exacto, SMTP
 * completo y EMAIL_DEV_REDIRECT_TO vacío (modo `live`).
 */

export const EMAIL_CONFIG = Symbol('EMAIL_CONFIG')

const DEFAULT_SMTP_PORT = 587
const HOSTNAME_RE = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/

export interface EmailSmtpConfig {
  readonly host: string
  readonly port: number
  /** TLS implícito (puerto 465). */
  readonly secure: boolean
  /** STARTTLS obligatorio en cualquier otro puerto: la clave nunca viaja en claro. */
  readonly requireTLS: boolean
  readonly user: string
  /** NO enumerable: no sale en JSON.stringify, util.inspect ni Sentry. */
  readonly pass: string
}

export interface EmailSenderConfig {
  address: string
  name: string
}

export interface EmailConfig {
  mode: EmailMode
  /** NODE_ENV === 'production' (misma regla que isJobsProd()). */
  isProd: boolean
  /** Redactados, sin secretos. Se loguean al arrancar: `error` en PROD, `warn` en dev. */
  problems: string[]
  /** Por qué `suppressed` (solo en ese modo). */
  suppressedReason: string | null
  /** Solo con SMTP completo. */
  smtp: EmailSmtpConfig | null
  redirectTo: string | null
  /** Un remitente sin variables válidas falta; el resto sigue. */
  senders: Partial<Record<EmailSenderKey, EmailSenderConfig>>
  templatesDir: string
}

export function loadEmailConfig(env: NodeJS.ProcessEnv, templatesDir: string): EmailConfig {
  const read = (key: string) => (env[key] ?? '').trim()
  const isProd = env.NODE_ENV === 'production'
  const isTest = env.NODE_ENV === 'test'
  const problems: string[] = []

  const host = read('EMAIL_HOST')
  const portRaw = read('EMAIL_PORT')
  const user = read('EMAIL_USER')
  const pass = read('EMAIL_PASS')
  const redirectRaw = read('EMAIL_DEV_REDIRECT_TO')

  // Remitentes: cada uno con su dirección (obligatoria) y su nombre (default SRS SUITE).
  const senders: Partial<Record<EmailSenderKey, EmailSenderConfig>> = {}
  const senderProblems: string[] = []
  for (const key of EMAIL_SENDER_KEYS) {
    const vars = EMAIL_SENDER_ENV[key]
    const address = read(vars.from)
    if (!address) senderProblems.push(`${vars.from} vacío: falta el remitente '${key}'`)
    else if (!EMAIL_ADDRESS_RE.test(address)) senderProblems.push(`${vars.from} inválido ("${address}")`)
    else senders[key] = { address, name: read(vars.fromName) || DEFAULT_EMAIL_FROM_NAME }
  }

  let smtpComplete = false
  let port = DEFAULT_SMTP_PORT
  if (!host) {
    if (isProd) problems.push('EMAIL_HOST vacío: email apagado')
  } else {
    const smtpProblems: string[] = []
    if (!HOSTNAME_RE.test(host)) smtpProblems.push(`EMAIL_HOST inválido ("${host}"): va el hostname, sin esquema ni espacios`)
    if (portRaw) {
      port = /^\d+$/.test(portRaw) ? parseInt(portRaw, 10) : NaN
      if (!(port >= 1 && port <= 65535)) smtpProblems.push(`EMAIL_PORT inválido ("${portRaw}"): se esperaba un entero (587)`)
    }
    const missing = [!user && 'EMAIL_USER', !pass && 'EMAIL_PASS'].filter(Boolean)
    if (missing.length) smtpProblems.push(`EMAIL_HOST está pero falta ${missing.join('/')}: nunca un SMTP a medias`)
    problems.push(...smtpProblems, ...senderProblems)
    // Sin el remitente por defecto no hay SMTP completo; otro remitente que falte no apaga el módulo.
    smtpComplete = smtpProblems.length === 0 && !!senders[DEFAULT_EMAIL_SENDER]
  }

  let redirectTo: string | null = null
  if (redirectRaw) {
    if (EMAIL_ADDRESS_RE.test(redirectRaw)) redirectTo = redirectRaw
    else problems.push(`EMAIL_DEV_REDIRECT_TO inválida ("${redirectRaw}")`)
  }

  let mode: EmailMode
  let suppressedReason: string | null = null
  if (isTest) {
    mode = 'suppressed'
    suppressedReason = 'NODE_ENV=test'
  } else if (isProd) {
    if (!smtpComplete || (redirectRaw && !redirectTo)) mode = 'disabled'
    else if (redirectTo) {
      mode = 'redirect'
      problems.push(`EMAIL_DEV_REDIRECT_TO está definida en producción: todo mail va a ${redirectTo}`)
    } else mode = 'live'
  } else if (smtpComplete && redirectTo) {
    mode = 'redirect'
  } else {
    mode = 'suppressed'
    if (redirectRaw && !redirectTo) suppressedReason = 'invalid EMAIL_DEV_REDIRECT_TO'
    else if (smtpComplete) suppressedReason = 'dev without EMAIL_DEV_REDIRECT_TO'
    else if (redirectTo) {
      suppressedReason = 'EMAIL_DEV_REDIRECT_TO needs EMAIL_HOST/USER/PASS/FROM'
      problems.push('EMAIL_DEV_REDIRECT_TO pide EMAIL_HOST/USER/PASS/FROM')
    } else suppressedReason = 'dev without SMTP config'
  }

  let smtp: EmailSmtpConfig | null = null
  if (smtpComplete) {
    const secure = port === 465
    smtp = { host, port, secure, requireTLS: !secure, user } as EmailSmtpConfig
    Object.defineProperty(smtp, 'pass', { value: pass, enumerable: false, writable: false })
  }

  return { mode, isProd, problems, suppressedReason, smtp, redirectTo, senders, templatesDir }
}
