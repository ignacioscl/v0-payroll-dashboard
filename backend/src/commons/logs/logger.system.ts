import { Injectable, LoggerService, LogLevel, Scope } from '@nestjs/common'

/**
 * Logger del Nest en JSON (plans/plan-buenas-practicas-v0, 3.11; https://docs.nestjs.com/techniques/logger, «Custom
 * logger»): una línea por evento, `{ time, level, context, msg, stack? }`, a stdout (stderr para `error` y `fatal`).
 * Nest 10 no trae `ConsoleLogger({ json: true })` (es de 12.1). Lo usa toda la app (`app.useLogger`, con `bufferLogs`
 * para que el arranque también salga en JSON) y los `new Logger(Clase.name)` delegan acá. Nunca se le pasan tokens,
 * encabezados ni el body (src/commons/logs/no-secrets-in-logs.boundary.spec.ts).
 *
 * Leerlo en el server: docker logs srs-suite-backend | jq -r '.time + " " + .level + " " + .msg'
 */
@Injectable({ scope: Scope.TRANSIENT })
export class LoggerSystem implements LoggerService {
  private context?: string

  setContext(context: string) {
    this.context = context
  }

  log(message: unknown, ...optional: unknown[]) {
    this.write('log', message, optional)
  }

  warn(message: unknown, ...optional: unknown[]) {
    this.write('warn', message, optional)
  }

  debug(message: unknown, ...optional: unknown[]) {
    this.write('debug', message, optional)
  }

  verbose(message: unknown, ...optional: unknown[]) {
    this.write('verbose', message, optional)
  }

  fatal(message: unknown, ...optional: unknown[]) {
    this.write('fatal', message, optional, true)
  }

  /** Nest llama `error(message, stack?, context?)`; el código propio, `error(message, err)`. */
  error(message: unknown, ...optional: unknown[]) {
    this.write('error', message, optional, true)
  }

  private write(level: LogLevel, message: unknown, optional: unknown[], withStack = false) {
    const rest = [...optional]
    let stack: string | undefined
    let context = this.context
    if (rest.length > 0 && typeof rest[rest.length - 1] === 'string' && (rest.length > 1 || !withStack)) {
      context = rest.pop() as string
    }
    if (withStack && rest[0] instanceof Error) stack = (rest.shift() as Error).stack
    else if (withStack && typeof rest[0] === 'string') stack = rest.shift() as string
    const msg = toText(message instanceof Error ? message.message : message)
    if (message instanceof Error && !stack) stack = message.stack
    const line = JSON.stringify({
      time: new Date().toISOString(),
      level,
      context,
      msg: rest.length > 0 ? `${msg} ${rest.map(toText).join(' ')}` : msg,
      ...(stack ? { stack } : {}),
    })
    ;(level === 'error' || level === 'fatal' ? process.stderr : process.stdout).write(`${line}\n`)
  }
}

function toText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.message
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
