import { forwardToSrs } from '@/lib/srs-proxy'

export type SrsFetchInit = RequestInit & {
  searchParams?: Record<string, string | number | undefined>
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
      body = new TextEncoder().encode(init.body).buffer
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
  })

  return response
}

/** Same-origin URL for client-side `fetch` (uses `/api/srs/[...path]` route). */
export function srsProxyUrl(path: string, searchParams?: Record<string, string | number | undefined>) {
  const normalized = path.replace(/^\//, '')
  let url = `/api/srs/${normalized}`
  if (searchParams) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== '') {
        params.set(key, String(value))
      }
    }
    const qs = params.toString()
    if (qs) url += `?${qs}`
  }
  return url
}
