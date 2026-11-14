import { fetchWithHeadersTimeout } from '@/lib/upstream-fetch'
import { BACKEND_TIMEOUT_MS } from '@/lib/upstream-timeouts'

/**
 * Server-side calls al backend NestJS de SRS Suite (KPIs).
 * En docker: BACKEND_API_URL=http://srs-backend:3020 (red interna del compose).
 * En dev local: por defecto http://localhost:3020.
 */
export function getBackendApiBaseUrl(): string {
  const url = process.env.BACKEND_API_URL?.trim() || 'http://localhost:3020'
  return url.replace(/\/$/, '')
}

/**
 * Reenvía al backend Nest con el token de PHP como Authorization: Bearer. `timeoutMs` cuenta hasta los encabezados
 * (por defecto `BACKEND_TIMEOUT_MS`); respeta `init.signal` (el pedido del navegador).
 */
export async function fetchBackend(
  path: string,
  token: string,
  init?: RequestInit,
  { timeoutMs = BACKEND_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<Response> {
  const base = getBackendApiBaseUrl()
  const target = path.startsWith('http') ? path : `${base}/${path.replace(/^\//, '')}`
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return fetchWithHeadersTimeout(target, { ...init, headers, cache: 'no-store' }, timeoutMs)
}
