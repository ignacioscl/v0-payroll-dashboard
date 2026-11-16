import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { servedAttachmentHeaders } from '@/lib/expense-attachments-validate'

const authorize = vi.fn()
const deny = vi.fn()
const log = vi.fn()

vi.mock('@/lib/expense-attachments-server', () => ({
  authorizeAttachmentAccess: (...a: unknown[]) => authorize(...a),
  denyAttachmentUpload: (...a: unknown[]) => deny(...a),
  logAttachmentUpload: (...a: unknown[]) => log(...a),
  nodeTicketsUrl: () => 'http://node/tickets',
  // El pedido al Node pasa por fetchNodeTickets (tiempo máximo hasta los encabezados); acá va directo al fetch falso.
  fetchNodeTickets: (url: string, init: RequestInit) => fetch(url, init),
}))

import { POST } from '@/app/api/expense-attachments/[idDealer]/[idExpense]/route'

const context = { params: Promise.resolve({ idDealer: '408', idExpense: '1' }) }
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46])
const jsonImg = (bytes: Buffer) => JSON.stringify({ img: `data:image/jpeg;base64,${bytes.toString('base64')}` })
const request = (body: BodyInit = jsonImg(JPEG), headers: Record<string, string> = { 'content-type': 'application/json' }) =>
  new NextRequest('http://local/x', { method: 'POST', body, headers, duplex: 'half' } as ConstructorParameters<typeof NextRequest>[1])

function multipart(file: Uint8Array, name: string): { body: Uint8Array; type: string } {
  const boundary = 'b0undary'
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/pdf\r\n\r\n`)
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
  return { body: Buffer.concat([head, Buffer.from(file), tail]), type: `multipart/form-data; boundary=${boundary}` }
}

/** Un stream sin Content-Length (lo que manda un cliente que no lo declara). */
function streamOf(bytes: Uint8Array, chunk = 1024 * 1024): ReadableStream<Uint8Array> {
  let i = 0
  return new ReadableStream({
    pull(c) {
      if (i >= bytes.length) return c.close()
      c.enqueue(bytes.subarray(i, i + chunk))
      i += chunk
    },
  })
}

describe('POST adjunto', () => {
  const nodeFetch = vi.fn()

  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', nodeFetch)
    authorize.mockResolvedValue({ session: { token: 't' }, idDealer: 408, idExpense: 1 })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sin permiso de escritura no manda nada al Node', async () => {
    deny.mockResolvedValue(NextResponse.json({ error: 'Not allowed' }, { status: 403 }))
    const res = await POST(request(), context)
    expect(res.status).toBe(403)
    expect(nodeFetch).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
  })

  it('con permiso sube y deja el log', async () => {
    deny.mockResolvedValue(null)
    log.mockResolvedValue(true)
    nodeFetch.mockResolvedValue(new Response('{"filename":"a.pdf"}', { status: 200 }))
    const res = await POST(request(), context)
    expect(res.status).toBe(200)
    expect(nodeFetch).toHaveBeenCalledTimes(1)
    expect(await res.json()).toMatchObject({ filename: 'a.pdf', logged: true })
  })

  describe('controles del servidor (3.14)', () => {
    const MB = 1024 * 1024
    beforeEach(() => {
      deny.mockResolvedValue(null)
      log.mockResolvedValue(true)
      nodeFetch.mockResolvedValue(new Response('{"filename":"a.pdf"}', { status: 200 }))
    })

    it('Content-Length de 15 MB → 413 sin leer ni llamar al Node', async () => {
      const res = await POST(request('x', { 'content-type': 'application/json', 'content-length': String(15 * MB) }), context)
      expect(res.status).toBe(413)
      expect(nodeFetch).not.toHaveBeenCalled()
    })

    it('multipart sin Content-Length con un PDF de 10 MB + 6 bytes → 413', async () => {
      const pdf = new Uint8Array(10 * MB + 6)
      pdf.set(Buffer.from('%PDF-'))
      const { body, type } = multipart(pdf, 'a.pdf')
      const res = await POST(request(streamOf(body), { 'content-type': type }), context)
      expect(res.status).toBe(413)
      expect(nodeFetch).not.toHaveBeenCalled()
    })

    it('un cuerpo sin Content-Length que pasa el tope del transporte → 413 y se corta la lectura', async () => {
      const res = await POST(request(streamOf(new Uint8Array(20 * MB)), { 'content-type': 'application/json' }), context)
      expect(res.status).toBe(413)
      expect(nodeFetch).not.toHaveBeenCalled()
    })

    it('un JSON cuyo JPEG decodificado pasa 10 MB → 413', async () => {
      const big = Buffer.concat([JPEG, Buffer.alloc(10 * MB)])
      const res = await POST(request(jsonImg(big)), context)
      expect(res.status).toBe(413)
    })

    it('un HTML disfrazado de JPEG → 400', async () => {
      const res = await POST(request(jsonImg(Buffer.from('<html><script>x</script></html>'))), context)
      expect(res.status).toBe(400)
      expect(nodeFetch).not.toHaveBeenCalled()
    })

    it('un PDF real de menos de 10 MB → pasa al Node', async () => {
      const pdf = new Uint8Array(2 * MB)
      pdf.set(Buffer.from('%PDF-1.7'))
      const { body, type } = multipart(pdf, 'a.pdf')
      const res = await POST(request(body, { 'content-type': type }), context)
      expect(res.status).toBe(200)
      expect(nodeFetch).toHaveBeenCalledTimes(1)
    })
  })
})

describe('servir un adjunto (3.14)', () => {
  it('el Node responde text/html → se descarga como octet-stream, con sandbox', () => {
    const h = servedAttachmentHeaders('text/html', 'x.html')
    expect(h['Content-Type']).toBe('application/octet-stream')
    expect(h['Content-Disposition']).toMatch(/^attachment;/)
    expect(h['Content-Security-Policy']).toBe('sandbox')
    expect(h['X-Content-Type-Options']).toBe('nosniff')
  })

  it('un PDF sale inline con nosniff y sin sandbox', () => {
    const h = servedAttachmentHeaders('application/pdf', 'a.pdf')
    expect(h['Content-Disposition']).toMatch(/^inline;/)
    expect(h['X-Content-Type-Options']).toBe('nosniff')
    expect(h['Content-Security-Policy']).toBeUndefined()
  })
})
