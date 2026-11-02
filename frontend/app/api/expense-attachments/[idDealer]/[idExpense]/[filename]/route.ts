import { NextRequest, NextResponse } from 'next/server'

import { authorizeAttachmentAccess, nodeTicketsUrl } from '@/lib/expense-attachments-server'

type RouteContext = { params: Promise<{ idDealer: string; idExpense: string; filename: string }> }

/** GET: el archivo del adjunto, binario tal cual (imagen o PDF). */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { idDealer, idExpense, filename } = await context.params
  const auth = await authorizeAttachmentAccess(idDealer, idExpense)
  if ('error' in auth) return auth.error

  const safeName = decodeURIComponent(filename).split('/').pop() ?? ''
  if (!safeName || safeName === '..' || safeName === '.') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const upstream = await fetch(nodeTicketsUrl(auth.idDealer, auth.idExpense, safeName), {
    method: 'GET',
    headers: { Authorization: auth.session.token },
    cache: 'no-store',
  })
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'Not found' }, { status: upstream.status === 404 ? 404 : 502 })
  }

  const out = new Headers()
  const type = upstream.headers.get('content-type')
  out.set(
    'Content-Type',
    type ??
      (safeName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
  )
  const length = upstream.headers.get('content-length')
  if (length) out.set('Content-Length', length)
  out.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(safeName)}`)
  out.set('Cache-Control', 'private, no-store')
  return new NextResponse(upstream.body, { status: 200, headers: out })
}
