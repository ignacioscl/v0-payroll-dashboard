import { NextResponse } from 'next/server'

import { isTimeoutError } from '@/lib/upstream-fetch'

/**
 * Errores de los pedidos del servidor de Next a otro servicio (plans/plan-buenas-practicas-v0, 2.6.5 y 2.6.10). Los
 * textos son los de D1, en inglés como «Unauthorized». Ninguna ruta devuelve al navegador el HTML ni el mensaje crudo
 * del upstream: el detalle queda en el log del servidor.
 */
export const UPSTREAM_TIMEOUT_MESSAGE = 'The server took too long to respond. Try again.'
export const UPSTREAM_UNREACHABLE_MESSAGE = 'Could not reach the server. Try again.'
export const UPSTREAM_UNEXPECTED_MESSAGE = 'The server returned an unexpected response. Try again.'

/** 504 si no contestó a tiempo; 502 para cualquier otro error de red. */
export function upstreamErrorStatus(err: unknown): 502 | 504 {
  return isTimeoutError(err) ? 504 : 502
}

export function upstreamErrorMessage(err: unknown): string {
  return isTimeoutError(err) ? UPSTREAM_TIMEOUT_MESSAGE : UPSTREAM_UNREACHABLE_MESSAGE
}

export function upstreamErrorResponse(err: unknown): NextResponse {
  console.error('upstream request failed', { name: (err as Error)?.name, message: (err as Error)?.message })
  return NextResponse.json({ error: upstreamErrorMessage(err) }, { status: upstreamErrorStatus(err) })
}

/**
 * Lee el JSON de un upstream (el PHP). Si viene otra cosa (el HTML de error del PHP), el detalle va al log del servidor
 * y tira con el texto de D1: nunca llega al navegador el HTML del upstream.
 */
export async function readUpstreamJson<T>(response: Response, label: string): Promise<T> {
  const text = await response.text()
  try {
    return JSON.parse(text) as T
  } catch {
    console.error('upstream returned non-JSON', {
      label,
      status: response.status,
      preview: text.replace(/\s+/g, ' ').slice(0, 280),
    })
    throw new Error(UPSTREAM_UNEXPECTED_MESSAGE)
  }
}

/** El texto de error que un proxy propio ya puso (`{ error: '…' }` de `upstreamErrorResponse`), si lo hay. */
export function proxyErrorText(json: unknown): string | undefined {
  const err = (json as { error?: unknown } | null)?.error
  return typeof err === 'string' ? err : undefined
}

/**
 * El PHP (u otro upstream) no contesta, contesta 5xx o tarda demasiado al validar la sesión: no es «sesión inválida».
 * Lo atrapa `app/error.tsx` (tarjeta con «Try again», sin el menú) en vez de borrar la sesión.
 */
export class UpstreamUnavailableError extends Error {
  constructor(readonly status: number) {
    super(`Upstream unavailable (${status})`)
    this.name = 'UpstreamUnavailableError'
  }
}
