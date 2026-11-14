import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Archivo de errores del servidor (plans/plan-buenas-practicas-v0, D2 y 2.1.6).
 *
 * `docker compose up -d --build` recrea el contenedor y borra `docker logs`; este archivo vive en
 * una carpeta del host montada como volumen (`./logs/backend:/app/logs`) y sobrevive al deploy.
 * Una línea JSON por error 5xx. NUNCA body, encabezados, cookies ni token: la entrada solo tiene
 * los campos de `ErrorLogEntry`.
 */

/** Ruta del archivo; en el contenedor, `/app/logs/errors.log`. `ERROR_LOG_PATH` la cambia (tests, local). */
export const DEFAULT_ERROR_LOG_PATH = '/app/logs/errors.log'
/** Al pasar este tamaño, el archivo se renombra a `errors.log.1` (y los anteriores corren uno). */
export const ERROR_LOG_MAX_BYTES = 10 * 1024 * 1024
/** Cuántos archivos viejos se guardan (`errors.log.1` … `.5`); el más viejo se borra. */
export const ERROR_LOG_KEEP_FILES = 5

export interface ErrorLogEntry {
  method?: string
  /** Ruta sin query (`request.route?.path`, o la URL sin `?…`). */
  route?: string
  status: number
  name?: string
  message?: string
  stack?: string
}

export function resolveErrorLogPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.ERROR_LOG_PATH?.trim() || DEFAULT_ERROR_LOG_PATH
}

function rotate(path: string, keep: number): void {
  rmSync(`${path}.${keep}`, { force: true })
  for (let i = keep - 1; i >= 1; i--) {
    if (existsSync(`${path}.${i}`)) renameSync(`${path}.${i}`, `${path}.${i + 1}`)
  }
  renameSync(path, `${path}.1`)
}

/**
 * Agrega una línea al archivo de errores. Nunca tira: si escribir falla (sin permiso, disco lleno),
 * lo dice por stderr y vuelve; la respuesta al usuario no cambia.
 */
export function appendErrorLine(
  entry: ErrorLogEntry,
  opts: { path?: string; maxBytes?: number; keepFiles?: number } = {},
): void {
  const path = opts.path ?? resolveErrorLogPath()
  const maxBytes = opts.maxBytes ?? ERROR_LOG_MAX_BYTES
  const keep = opts.keepFiles ?? ERROR_LOG_KEEP_FILES
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level: 'error',
    source: 'nest',
    method: entry.method,
    route: entry.route,
    status: entry.status,
    name: entry.name,
    message: entry.message,
    stack: entry.stack,
  })
  try {
    mkdirSync(dirname(path), { recursive: true })
    if (existsSync(path) && statSync(path).size >= maxBytes) rotate(path, keep)
    appendFileSync(path, `${line}\n`)
  } catch (e) {
    process.stderr.write(`error-log-file: could not write ${path}: ${(e as Error).message}\n${line}\n`)
  }
}
