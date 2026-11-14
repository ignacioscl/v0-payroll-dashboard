import { NextResponse } from 'next/server'
import { getSrsSession } from '@/lib/auth/session'
import { fetchSrsUpstream, getSrsApiBaseUrl } from '@/lib/srs-upstream'
import { upstreamErrorResponse } from '@/lib/upstream-error'

export type SrsProxyOptions = {
  method: string
  pathSegments: string[]
  search?: string
  body?: ArrayBuffer | null
  contentType?: string | null
  accept?: string | null
  /** Hasta los encabezados; por defecto `SRS_PROXY_TIMEOUT_MS` (lib/upstream-timeouts.ts). */
  timeoutMs?: number
}

/**
 * Forwards a request to SRS public PHP using the SSO session token from cookies.
 */
export async function forwardToSrs({
  method,
  pathSegments,
  search = '',
  body = null,
  contentType = null,
  accept = null,
  timeoutMs,
}: SrsProxyOptions) {
  const session = await getSrsSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const path = '/' + pathSegments.map((p) => encodeURIComponent(p)).join('/')
  const target = new URL(path, `${getSrsApiBaseUrl()}/`)
  if (search) {
    target.search = search.startsWith('?') ? search : `?${search}`
  }

  const headers = new Headers()
  if (contentType) {
    headers.set('Content-Type', contentType)
  }
  if (accept) {
    headers.set('Accept', accept)
  }
  headers.set('Authorization', session.token)
  headers.set('App-name', 'SRS-WEB')

  const hasBody = method !== 'GET' && method !== 'HEAD' && body != null

  let upstream: Response
  try {
    upstream = await fetchSrsUpstream(
      target.toString(),
      { method, headers, body: hasBody ? body : undefined },
      { timeoutMs },
    )
  } catch (err) {
    // No contestó a tiempo → 504; caído → 502. Nunca un 500 vacío.
    return upstreamErrorResponse(err)
  }

  const responseHeaders = new Headers()
  const upstreamType = upstream.headers.get('content-type')
  if (upstreamType) {
    responseHeaders.set('Content-Type', upstreamType)
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  })
}
