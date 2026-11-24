/**
 * El cliente del Nest por el proxy `/api/srs-kpis/[...path]`, con su lectura de errores (plans/plan-wo-to-be-billed-v0,
 * T9). Antes había dos copias (`srs-generic-invoices-api.ts` y `srs-expenses-api.ts`); WO to be Billed usa este y las
 * dos de antes también.
 *
 * El error **conserva la lista `validationErrors` tal como llega** (además de `status`, `code` y `meta`), así un
 * formulario puede poner el error debajo de su campo y llevarle el foco (`useFormWithFocus`).
 */

export interface NestFieldError {
  field: string
  message: string
}

export type NestErrorBody = {
  message?: string | string[]
  validationErrors?: Array<{ field?: string; message?: string } | string> | string
  statusCode?: number
  code?: string
  meta?: Record<string, unknown>
}

export class SrsNestApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly meta?: Record<string, unknown>
  readonly validationErrors: NestFieldError[]

  constructor(
    message: string,
    status: number,
    extra: { code?: string; meta?: Record<string, unknown>; validationErrors?: NestFieldError[] } = {},
  ) {
    super(message)
    this.name = 'SrsNestApiError'
    this.status = status
    this.code = extra.code
    this.meta = extra.meta
    this.validationErrors = extra.validationErrors ?? []
  }
}

export function isSrsNestApiError(err: unknown): err is SrsNestApiError {
  return err instanceof SrsNestApiError
}

/** Los errores de campo del cuerpo (`[{ field, message }]`), tal como llegan; lo que no tiene esa forma se descarta. */
export function nestFieldErrors(body: NestErrorBody | null): NestFieldError[] {
  const raw = body?.validationErrors
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (e): e is NestFieldError =>
      typeof e === 'object' && e != null && typeof e.field === 'string' && typeof e.message === 'string',
  )
}

/** El cuerpo JSON de un error del Nest, o `null` si no es JSON. */
export async function readNestErrorBody(res: Response): Promise<NestErrorBody | null> {
  try {
    return (await res.json()) as NestErrorBody
  } catch {
    return null
  }
}

/** El mensaje: `message` (texto o lista), si no el primer error de campo, si no el texto de respaldo. */
export function nestErrorMessage(body: NestErrorBody | null, fallback: string): string {
  if (!body) return fallback
  if (Array.isArray(body.message)) return body.message.filter(Boolean).join(', ') || fallback
  if (typeof body.message === 'string' && body.message.trim()) return body.message
  const fields = nestFieldErrors(body)
  if (fields.length > 0) return fields[0].message
  return fallback
}

/** El error común a partir de la respuesta: mensaje, estado, `code`, `meta` y los errores de campo. */
export async function parseSrsNestError(res: Response, fallback: string): Promise<SrsNestApiError> {
  const body = await readNestErrorBody(res)
  return new SrsNestApiError(nestErrorMessage(body, fallback), res.status, {
    code: body?.code,
    meta: body?.meta,
    validationErrors: nestFieldErrors(body),
  })
}

/**
 * Un pedido JSON al Nest. Ante un error, `toError` arma el error que tira (por defecto, el común); un 204 devuelve
 * `undefined`.
 */
export async function requestNestJson<T>(
  url: string,
  init: RequestInit,
  fallback: string,
  toError: (res: Response, fallback: string) => Promise<Error> = parseSrsNestError,
): Promise<T> {
  const res = await fetch(url, {
    cache: 'no-store',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!res.ok) throw await toError(res, fallback)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
