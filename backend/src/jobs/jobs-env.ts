/**
 * Dev no es producción (Ignacio, 03/10/2026). Único lugar donde los jobs miran el entorno:
 * ningún job pregunta `NODE_ENV` por su cuenta (regla worker-jobs.mdc).
 *
 * | Qué                    | Producción                         | Dev                              |
 * |------------------------|------------------------------------|----------------------------------|
 * | Cron diario y watchdog | si además JOBS_CRON_ENABLED=true   | nunca se registran               |
 * | Email de alerta        | a JOBS_ALERT_EMAIL                 | nunca sale: queda en el log      |
 * | Corrida manual         | anda                               | anda (escribe en la base local)  |
 *
 * `JOBS_DEV_FORCE=true` hace que dev se comporte como producción para probar cron y alertas en
 * local. Nunca va a prod ni a `.env.template`.
 */

/** NODE_ENV=production (el mismo valor que `configuration.ts` expone como `nodeEnv`). */
export function isJobsProd(): boolean {
  return process.env.NODE_ENV === 'production'
}

/** Llave de prueba local: dev se comporta como producción para cron y alertas. */
export function isJobsDevForce(): boolean {
  return process.env.JOBS_DEV_FORCE === 'true'
}

/** Cron y alertas se comportan como en producción. */
export function jobsBehaveAsProd(): boolean {
  return isJobsProd() || isJobsDevForce()
}

/** El CLI fuerza `JOBS_CRON_ENABLED=false` antes de levantar el contexto. */
export function isJobsCronEnabled(): boolean {
  return jobsBehaveAsProd() && process.env.JOBS_CRON_ENABLED === 'true'
}

/** Motivo legible de por qué el cron no corre (para el log de arranque y el health). */
export function jobsCronDisabledReason(): string | null {
  if (!jobsBehaveAsProd()) return 'disabled (development)'
  if (process.env.JOBS_CRON_ENABLED !== 'true') return 'disabled (JOBS_CRON_ENABLED)'
  return null
}

/** Las alertas por email salen solo en producción (o con JOBS_DEV_FORCE). */
export function areJobAlertsEnabled(): boolean {
  return jobsBehaveAsProd()
}
