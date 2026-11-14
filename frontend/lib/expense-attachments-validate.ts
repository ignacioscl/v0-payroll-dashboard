import 'server-only'

import { ATTACHMENT_MAX_BYTES } from '@/lib/expense-attachments'

/**
 * Control en el servidor de un adjunto de Expenses (plans/plan-buenas-practicas-v0, 3.14; doc de Next
 * `02-guides/backend-for-frontend.md`, «Validate content type and size»). El navegador ya limita (10 MB, imagen
 * reducida a JPEG o PDF), pero el servidor no confiaba en nadie: ahora mide el transporte, el archivo real y su tipo.
 */

/** Tope del cuerpo del pedido: el archivo máximo más el margen del base64 (4/3) y del multipart. */
export const ATTACHMENT_MAX_TRANSPORT_BYTES = Math.ceil((ATTACHMENT_MAX_BYTES * 4) / 3) + 64 * 1024

export const ATTACHMENT_TOO_BIG_MESSAGE = 'The file is over 10 MB.'
export const ATTACHMENT_TYPE_MESSAGE = 'Only images or PDF are allowed.'

export type BodyRead = { ok: true; bytes: Uint8Array } | { ok: false; status: 413 }

/**
 * Lee el cuerpo con tope: si `Content-Length` ya pasa, 413 sin leer; si no viene o miente, cuenta los bytes del
 * stream y corta la lectura al pasar el tope.
 */
export async function readBodyWithLimit(request: Request, max = ATTACHMENT_MAX_TRANSPORT_BYTES): Promise<BodyRead> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > max) return { ok: false, status: 413 }
  if (!request.body) return { ok: true, bytes: new Uint8Array() }
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel().catch(() => undefined)
      return { ok: false, status: 413 }
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    bytes.set(c, offset)
    offset += c.byteLength
  }
  return { ok: true, bytes }
}

export type UploadCheck = { ok: true } | { ok: false; status: 400 | 413; error: string }

const JPEG_PREFIX = 'data:image/jpeg;base64,'

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  return sig.every((b, i) => bytes[i] === b)
}

/**
 * El archivo real: JSON con `img` (data URL JPEG) o multipart con `file` (PDF). Mide el archivo decodificado contra
 * ATTACHMENT_MAX_BYTES y mira su firma (JPEG `FF D8 FF`, PDF `%PDF-`).
 */
export async function checkAttachmentUpload(contentType: string, bytes: Uint8Array): Promise<UploadCheck> {
  const type = contentType.toLowerCase()
  const bad = { ok: false as const, status: 400 as const, error: ATTACHMENT_TYPE_MESSAGE }
  const big = { ok: false as const, status: 413 as const, error: ATTACHMENT_TOO_BIG_MESSAGE }
  if (type.startsWith('application/json')) {
    let img: unknown
    try {
      img = (JSON.parse(new TextDecoder().decode(bytes)) as { img?: unknown }).img
    } catch {
      return bad
    }
    if (typeof img !== 'string' || !img.startsWith(JPEG_PREFIX)) return bad
    const file = Buffer.from(img.slice(JPEG_PREFIX.length), 'base64')
    if (file.byteLength > ATTACHMENT_MAX_BYTES) return big
    return startsWith(file, [0xff, 0xd8, 0xff]) ? { ok: true } : bad
  }
  if (type.startsWith('multipart/form-data')) {
    let file: FormDataEntryValue | null
    try {
      file = (await new Response(bytes as BodyInit, { headers: { 'content-type': contentType } }).formData()).get('file')
    } catch {
      return bad
    }
    if (!file || typeof file === 'string') return bad
    if (file.size > ATTACHMENT_MAX_BYTES) return big
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer())
    return startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d]) ? { ok: true } : bad
  }
  return bad
}

/** Al servir: solo PDF e imágenes van `inline`; lo demás se descarga, encerrado. Siempre `nosniff`. */
export function servedAttachmentHeaders(upstreamType: string | null, safeName: string): Record<string, string> {
  const type = (upstreamType ?? '').split(';')[0].trim().toLowerCase()
  const inline = ['application/pdf', 'image/jpeg', 'image/png'].includes(type)
  const encoded = encodeURIComponent(safeName)
  if (inline) {
    return {
      'Content-Type': type,
      'Content-Disposition': `inline; filename*=UTF-8''${encoded}`,
      'X-Content-Type-Options': 'nosniff',
    }
  }
  return {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename*=UTF-8''${encoded}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': 'sandbox',
  }
}
