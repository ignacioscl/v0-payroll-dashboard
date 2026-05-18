import { NextResponse } from 'next/server'
import { getSrsSession } from '@/lib/auth/session'

function getSrsApiBaseUrl(): string {
  const url = process.env.SRS_API_URL?.trim()
  if (!url) {
    throw new Error('SRS_API_URL is not configured')
  }
  return url.replace(/\/$/, '')
}

export type SrsProxyOptions = {
  method: string
  pathSegments: string[]
  search?: string
  body?: ArrayBuffer | null
  contentType?: string | null
  accept?: string | null
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
}: SrsProxyOptions) {
  const session = await getSrsSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const path = '/' + pathSegments.map((p) => encodeURIComponent(p)).join('/')
  const target = new URL(path, getSrsApiBaseUrl())
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

  const upstream = await fetch(target.toString(), {
    method,
    headers,
    body: hasBody ? body : undefined,
    cache: 'no-store',
  })

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
