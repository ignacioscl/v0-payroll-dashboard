/**
 * Remitentes del módulo de email (plans/plan-nest-email §8.3). Hoy uno solo: SRS.
 *
 * Agregar uno: la clave en EMAIL_SENDER_KEYS y su fila en EMAIL_SENDER_ENV (TypeScript obliga a
 * completar el Record), sus variables en `.env.template` y `srs-backend.env.example` (en PROD las
 * carga Ignacio) y un caso en `email.config.spec.ts`. El consumidor solo pasa `sender: 'x'`.
 */
export const EMAIL_SENDER_KEYS = ['srs'] as const
export type EmailSenderKey = (typeof EMAIL_SENDER_KEYS)[number]
export const DEFAULT_EMAIL_SENDER: EmailSenderKey = 'srs'

/** Qué variables definen a cada remitente. */
export const EMAIL_SENDER_ENV: Record<EmailSenderKey, { from: string; fromName: string }> = {
  srs: { from: 'EMAIL_FROM', fromName: 'EMAIL_FROM_NAME' },
}

/** Nombre del remitente cuando su variable `*_FROM_NAME` está vacía. */
export const DEFAULT_EMAIL_FROM_NAME = 'SRS SUITE'

export function isEmailSenderKey(value: unknown): value is EmailSenderKey {
  return typeof value === 'string' && (EMAIL_SENDER_KEYS as readonly string[]).indexOf(value) >= 0
}
