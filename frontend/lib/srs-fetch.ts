import 'server-only'
import { forwardToSrs } from '@/lib/srs-proxy'

export { srsProxyUrl } from '@/lib/srs-proxy-url'

export type SrsFetchInit = RequestInit & {
  searchParams?: Record<string, string | number | undefined>
  /** Hasta los encabezados; por defecto `SRS_PROXY_TIMEOUT_MS` (lib/upstream-timeouts.ts). */
  timeoutMs?: number
}

/**
 * Server-side: calls SRS through the shared proxy logic (no middleware, no browser CORS).
 */
export async function srsFetch(path: string, init?: SrsFetchInit) {
  const normalized = path.replace(/^\//, '').split('/').filter(Boolean)
  const method = init?.method ?? 'GET'
  const hasBody = method !== 'GET' && method !== 'HEAD'

  let search = ''
  if (init?.searchParams) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(init.searchParams)) {
      if (value !== undefined && value !== '') {
        params.set(key, String(value))
      }
    }
    const qs = params.toString()
    if (qs) search = `?${qs}`
  }

  let body: ArrayBuffer | null = null
  if (hasBody && init?.body) {
    if (typeof init.body === 'string') {
      // Copia a un ArrayBuffer propio (el de TextEncoder se tipa como ArrayBufferLike).
      body = new TextEncoder().encode(init.body).slice().buffer as ArrayBuffer
    } else if (init.body instanceof ArrayBuffer) {
      body = init.body
    } else {
      body = await new Response(init.body).arrayBuffer()
    }
  }

  const headers = new Headers(init?.headers)
  const response = await forwardToSrs({
    method,
    pathSegments: normalized,
    search,
    body,
    contentType: headers.get('content-type'),
    accept: headers.get('accept'),
    timeoutMs: init?.timeoutMs,
  })

  return response
}
