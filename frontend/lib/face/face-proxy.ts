import 'server-only'
import { NextResponse } from 'next/server'
import { getSrsSession } from '@/lib/auth/session'
import { upstreamErrorResponse } from '@/lib/upstream-error'
import { fetchWithHeadersTimeout } from '@/lib/upstream-fetch'
import { FACE_TIMEOUT_MS } from '@/lib/upstream-timeouts'

function getFaceApiBaseUrl(): string {
  const url = (process.env.FACE_RECOGNITION_URL ?? 'http://localhost:3008').trim()
  return url.replace(/\/$/, '')
}

export type FaceProxyOptions = {
  method: string
  pathSegments: string[]
  search?: string
  body?: ArrayBuffer | null
  contentType?: string | null
  accept?: string | null
}

export async function forwardToFace({
  method,
  pathSegments,
  search = '',
  body = null,
  contentType = null,
  accept = null,
}: FaceProxyOptions) {
  const session = await getSrsSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const path = '/' + pathSegments.map((p) => encodeURIComponent(p)).join('/')
  const target = new URL(path, getFaceApiBaseUrl())
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
  const token = session.token.startsWith('Bearer ') ? session.token : `Bearer ${session.token}`
  headers.set('Authorization', token)

  const hasBody = method !== 'GET' && method !== 'HEAD' && body != null

  let upstream: Response
  try {
    upstream = await fetchWithHeadersTimeout(
      target.toString(),
      { method, headers, body: hasBody ? body : undefined, cache: 'no-store' },
      FACE_TIMEOUT_MS,
    )
  } catch (err) {
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
