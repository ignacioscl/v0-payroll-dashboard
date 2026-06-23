import type { LoggerOptions } from 'typeorm'

/** Activa log de SQL en consola con DB_LOGGING=true o DEBUG_QUERIES=true. */
export function resolveTypeOrmLogging(): LoggerOptions {
  const enabled =
    process.env.DB_LOGGING === 'true' || process.env.DEBUG_QUERIES === 'true'
  return enabled ? ['query', 'error', 'warn'] : false
}
