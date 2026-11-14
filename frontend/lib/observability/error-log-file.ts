import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Archivo de errores del servidor de Next (plans/plan-buenas-practicas-v0, D2 y 2.10). `docker compose up -d --build`
 * borra `docker logs`; este archivo vive en una carpeta del host (`./logs/front:/app/logs`) y sobrevive al deploy. Misma
 * rotación que el del Nest (`backend/src/commons/logs/error-log-file.ts`). Solo corre en el runtime de Node.
 */

/** En el contenedor, `/app/logs/errors.log`; `ERROR_LOG_PATH` la cambia (tests, local). */
export const DEFAULT_ERROR_LOG_PATH = '/app/logs/errors.log'
/** Al pasar este tamaño se renombra a `errors.log.1` (y los anteriores corren uno). */
export const ERROR_LOG_MAX_BYTES = 10 * 1024 * 1024
/** Cuántos archivos viejos se guardan; el más viejo se borra. */
export const ERROR_LOG_KEEP_FILES = 5

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

/** Agrega una línea ya armada. Nunca tira: si escribir falla, devuelve false (la línea ya salió por stderr). */
export function appendLogLine(
  line: string,
  opts: { path?: string; maxBytes?: number; keepFiles?: number } = {},
): boolean {
  const path = opts.path ?? resolveErrorLogPath()
  try {
    mkdirSync(dirname(path), { recursive: true })
    if (existsSync(path) && statSync(path).size >= (opts.maxBytes ?? ERROR_LOG_MAX_BYTES)) {
      rotate(path, opts.keepFiles ?? ERROR_LOG_KEEP_FILES)
    }
    appendFileSync(path, `${line}\n`)
    return true
  } catch (e) {
    process.stderr.write(`error-log-file: could not write ${path}: ${(e as Error).message}\n`)
    return false
  }
}
