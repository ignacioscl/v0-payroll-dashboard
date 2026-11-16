import type { Instrumentation } from 'next'

/**
 * Errores del servidor de Next: una línea JSON en stderr y en `logs/front/errors.log` del server (D2), sin encabezados
 * ni cookies. Solo en el runtime de Node, como pide la doc (`03-file-conventions/instrumentation.md`). La lógica vive en
 * `lib/observability/report-request-error.ts` (la prueba vitest). Sentry en el front va con la tarea `sentry-v0`.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { reportRequestError } = await import('./lib/observability/report-request-error')
  reportRequestError({ error, request, context })
}
