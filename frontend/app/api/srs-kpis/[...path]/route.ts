import { NextRequest, NextResponse } from 'next/server'
import { getSrsSession } from '@/lib/auth/session'
import { fetchBackend } from '@/lib/backend-upstream'

type RouteContext = { params: Promise<{ path: string[] }> }

/**
 * Proxy server-side al backend NestJS (KPIs). El browser pega acá (mismo origen),
 * y esta ruta reenvía a http://srs-backend:3020/api/srs/<path> con el token de PHP.
 * El backend valida ese JWT (mismo secret que PHP).
 */
async function handle(request: NextRequest, context: RouteContext) {
  const session = await getSrsSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { path } = await context.params
  const search = request.nextUrl.search
  const url = new URL(`http://local${search}`)
  if (session.user.idDealerProvider && session.user.idDealerProvider > 0) {
    url.searchParams.set('idDealerProvider', String(session.user.idDealerProvider))
  }
  const query = url.search
  const target = `api/srs/${path.map((p) => encodeURIComponent(p)).join('/')}${query}`

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  const upstream = await fetchBackend(target, session.token, {
    method: request.method,
    headers: { 'Content-Type': request.headers.get('content-type') ?? 'application/json' },
    body: hasBody ? await request.arrayBuffer() : undefined,
  })

  const buf = await upstream.arrayBuffer()
  return new NextResponse(buf, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
  })
}

export const GET = handle
export const POST = handle
