import { NextRequest, NextResponse } from 'next/server'

import { authorizeAttachmentAccess, denyAttachmentUpload, logAttachmentUpload, nodeTicketsUrl } from '@/lib/expense-attachments-server'

type RouteContext = { params: Promise<{ idDealer: string; idExpense: string }> }

/** El Node lista nombres; se normaliza a `{ files: string[] }` acepte lo que acepte su forma. */
function normalizeFileList(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? ((raw as { files?: unknown; data?: unknown; results?: unknown }).files ??
        (raw as { data?: unknown }).data ??
        (raw as { results?: unknown }).results ??
        [])
      : []
  if (!Array.isArray(list)) return []
  return list
    .map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object') {
        const o = item as { name?: unknown; filename?: unknown; Key?: unknown; key?: unknown }
        const v = o.name ?? o.filename ?? o.Key ?? o.key
        return typeof v === 'string' ? v : ''
      }
      return ''
    })
    .map((name) => name.split('/').pop() ?? '')
    .filter((name) => name.length > 0)
}

/** GET: lista de adjuntos del gasto. */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { idDealer, idExpense } = await context.params
  const auth = await authorizeAttachmentAccess(idDealer, idExpense)
  if ('error' in auth) return auth.error

  const upstream = await fetch(nodeTicketsUrl(auth.idDealer, auth.idExpense), {
    method: 'GET',
    headers: { Authorization: auth.session.token },
    cache: 'no-store',
  })
  if (upstream.status === 404) return NextResponse.json({ files: [] })
  if (!upstream.ok) {
    return NextResponse.json({ error: `Attachments (${upstream.status})` }, { status: 502 })
  }
  let raw: unknown = []
  try {
    raw = await upstream.json()
  } catch {
    raw = []
  }
  return NextResponse.json({ files: normalizeFileList(raw) })
}

/** El Node responde `{ filename }` al subir; se acepta también `name` por si cambia la forma. */
function uploadedFilename(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as { filename?: unknown; name?: unknown }
  const v = o.filename ?? o.name
  if (typeof v !== 'string' || !v.trim()) return null
  return v.split('/').pop() ?? null
}

/**
 * POST: sube un adjunto. JSON `{ img }` (data URL JPEG) o multipart `file` (PDF), tal como lo manda
 * el navegador; el cuerpo se reenvía sin tocar. Con un 200 del Node se deja el registro en el log
 * del gasto por el Nest (`POST /api/srs/expenses/:id/attachment-log { filename }`, de ahí sale
 * `hasAttachment`). Si el Nest falla, la subida igual está hecha: se responde 200 con
 * `logged: false` y el front avisa sin bloquear.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { idDealer, idExpense } = await context.params
  const auth = await authorizeAttachmentAccess(idDealer, idExpense)
  if ('error' in auth) return auth.error
  const denied = await denyAttachmentUpload(auth.session, auth.idExpense)
  if (denied) return denied

  const contentType = request.headers.get('content-type') ?? 'application/json'
  const body = await request.arrayBuffer()
  const upstream = await fetch(nodeTicketsUrl(auth.idDealer, auth.idExpense), {
    method: 'POST',
    headers: { 'Content-Type': contentType, Authorization: auth.session.token },
    body,
    cache: 'no-store',
  })
  const text = await upstream.text()
  if (!upstream.ok) {
    return new NextResponse(text || '{}', {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
    })
  }

  let raw: unknown = {}
  try {
    raw = text ? JSON.parse(text) : {}
  } catch {
    raw = {}
  }
  const filename = uploadedFilename(raw)
  // Sin nombre no hay qué registrar: cuenta como log fallido (la subida sí está hecha).
  const logged = filename ? await logAttachmentUpload(auth.session, auth.idExpense, filename) : false
  const out = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  return NextResponse.json({ ...out, filename, logged })
}
