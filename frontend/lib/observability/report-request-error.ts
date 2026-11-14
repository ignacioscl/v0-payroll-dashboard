import { appendLogLine } from '@/lib/observability/error-log-file'

/**
 * Lo que hace `onRequestError` de `instrumentation.ts` (plans/plan-buenas-practicas-v0, 2.10): una línea JSON por error
 * del servidor de Next en stderr y en el archivo de errores. **Nunca `request.headers`**: ahí viajan las cookies de
 * sesión. La ruta va sin query.
 */
export type RequestErrorInput = {
  error: unknown
  request: { path?: string; method?: string; headers?: unknown }
  context: { routePath?: string; routeType?: string; renderSource?: string; routerKind?: string }
}

export function buildRequestErrorLine({ error, request, context }: RequestErrorInput): string {
  const err = (error ?? {}) as { message?: string; stack?: string; digest?: string; name?: string }
  return JSON.stringify({
    time: new Date().toISOString(),
    level: 'error',
    source: 'next',
    digest: err.digest,
    name: err.name,
    message: err.message,
    stack: err.stack,
    path: request?.path?.split('?')[0],
    method: request?.method,
    routePath: context?.routePath,
    routeType: context?.routeType,
    renderSource: context?.renderSource,
  })
}

export function reportRequestError(
  input: RequestErrorInput,
  opts: { path?: string; maxBytes?: number; keepFiles?: number } = {},
): string {
  const line = buildRequestErrorLine(input)
  process.stderr.write(`${line}\n`)
  appendLogLine(line, opts)
  return line
}
