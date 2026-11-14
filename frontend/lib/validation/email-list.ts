/**
 * Lista de correos de un campo «Email To»: direcciones separadas por coma, cada una con formato de correo y hasta 64
 * caracteres (las columnas EMAIL_*; D15 y D22 de plans/plan-export-invoices-nest). Vacías sueltas («a@b.com,») se
 * ignoran y las repetidas (sin importar mayúsculas) quedan una vez.
 *
 * Pareja: backend/src/srs/billing/email-list.ts (misma expresión, mismos límites, mismo orden de errores).
 * Casos compartidos: shared/email-list-cases.json (los leen email-list.test.ts y email-list.spec.ts).
 * Regla global «Todo campo valida que el dato sea real» (plans/plan-buenas-practicas-v0, 3.17).
 */

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const EMAIL_MAX_LENGTH = 64

export type EmailListError = 'required' | 'separator' | 'invalid' | 'long'

export type EmailListCheck = { ok: true; emails: string[] } | { ok: false; error: EmailListError }

/** Otro signo entre direcciones («;», «|», espacio, salto de línea) o dos direcciones pegadas. */
function looksLikeOtherSeparator(part: string): boolean {
  return /[;|\s]/.test(part) || part.split('@').length > 2
}

/** Una dirección suelta: null si está bien. */
function checkOne(email: string): Exclude<EmailListError, 'required'> | null {
  if (looksLikeOtherSeparator(email)) return 'separator'
  if (!EMAIL_PATTERN.test(email)) return 'invalid'
  if (email.length > EMAIL_MAX_LENGTH) return 'long'
  return null
}

export function checkEmailList(raw: string | null | undefined): EmailListCheck {
  const emails: string[] = []
  const seen = new Set<string>()
  for (const part of (raw ?? '').split(',')) {
    const email = part.trim()
    if (!email) continue
    const error = checkOne(email)
    if (error) return { ok: false, error }
    const key = email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    emails.push(email)
  }
  return emails.length ? { ok: true, emails } : { ok: false, error: 'required' }
}

/** Un campo de una sola dirección que puede quedar vacío (Reply-To): null si está vacío o bien. */
export function checkOptionalEmail(raw: string | null | undefined): Exclude<EmailListError, 'required'> | null {
  const email = (raw ?? '').trim()
  if (!email) return null
  const error = checkOne(email)
  // Una sola dirección: dos o un signo en el medio no es un problema de separador, es una dirección inválida.
  return error === 'separator' ? 'invalid' : error
}

/** Textos de cada error (front; el back tiene los suyos en inglés). `required` lo pone cada pantalla. */
export const EMAIL_LIST_ERROR_KEYS: Record<Exclude<EmailListError, 'required'>, string> = {
  separator: 'invoices.emailListSeparator',
  invalid: 'invoices.actionEmailInvalid',
  long: 'invoices.emailListTooLong',
}
