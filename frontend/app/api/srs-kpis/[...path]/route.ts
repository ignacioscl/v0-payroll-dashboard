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
  // Keep list filters (page, term, …). Never forward idDealerProvider from the
  // browser query — Nest resolves provider from JWT+DB; for Admin General/Company
  // (no id_contratista_owner) we inject the session empresa as an internal header.
  const url = new URL(`http://local${request.nextUrl.search}`)
  url.searchParams.delete('idDealerProvider')
  const query = url.search
  const target = `api/srs/${path.map((p) => encodeURIComponent(p)).join('/')}${query}`

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  const headers: Record<string, string> = {
    'Content-Type': request.headers.get('content-type') ?? 'application/json',
  }
  // Overwrite any client-supplied value: only httpOnly session may set this.
  if (session.user.idDealerProvider && session.user.idDealerProvider > 0) {
    headers['x-srs-dealer-provider'] = String(session.user.idDealerProvider)
  }

  const upstream = await fetchBackend(target, session.token, {
    method: request.method,
    headers,
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
export const PUT = handle
export const DELETE = handle
