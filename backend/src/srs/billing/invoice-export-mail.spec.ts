import http from 'node:http'
import type { AddressInfo } from 'node:net'

import { parseInvoiceExportEmails } from './dto/invoice-export.dto'
import { buildMultipart, phpRequest } from './invoice-export-php-client'
import { PunchExportTicketStore } from '../shared/export/punch-export-ticket.store'

describe('parseInvoiceExportEmails (D15, D22)', () => {
  it('splits, trims and removes repeats regardless of case', () => {
    expect(parseInvoiceExportEmails(' a@b.com, A@B.com ,c@d.org,')).toEqual(['a@b.com', 'c@d.org'])
  })
  it('null when empty, invalid or longer than 64', () => {
    expect(parseInvoiceExportEmails(' , ')).toBeNull()
    expect(parseInvoiceExportEmails('hola')).toBeNull()
    expect(parseInvoiceExportEmails('a@b.com, mal')).toBeNull()
    expect(parseInvoiceExportEmails(`${'x'.repeat(60)}@b.com`)).toBeNull()
  })
})

describe('buildMultipart (M3: the size of the whole body is known before posting)', () => {
  it('writes the fields and the file, and its length is the real body length', () => {
    const content = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00])
    const { body, contentType } = buildMultipart(
      [
        { name: 'action', value: 'email' },
        { name: 'sha256', value: 'abc' },
      ],
      { name: 'file', filename: 'a"b.xlsx', contentType: 'application/x', content },
    )
    const boundary = contentType.split('boundary=')[1]
    const text = body.toString('latin1')
    expect(text.startsWith(`--${boundary}\r\n`)).toBe(true)
    expect(text).toContain('name="action"\r\n\r\nemail\r\n')
    expect(text).toContain('filename="ab.xlsx"')
    expect(text.endsWith(`--${boundary}--\r\n`)).toBe(true)
    expect(body.includes(content)).toBe(true)
  })
})

describe('phpRequest', () => {
  let server: http.Server
  let base: string
  let lastHeaders: http.IncomingHttpHeaders = {}
  let reply: (res: http.ServerResponse) => void

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      lastHeaders = req.headers
      req.resume()
      req.on('end', () => reply(res))
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise<void>((r) => server.close(() => r())))

  it('sends the PHP token and App-name, and reads ErrorManager success', async () => {
    reply = (res) => res.end('{"status":"success","error":{"code":"0","message":""},"data":{"sent":true}}')
    const out = await phpRequest<{ sent: boolean }>({ baseUrl: base, token: 'tok', method: 'GET' })
    expect(lastHeaders['authorization']).toBe('tok')
    expect(lastHeaders['app-name']).toBe('SRS-WEB')
    expect(out).toEqual({ status: 'success', message: '', data: { sent: true } })
  })

  it('a fail keeps the PHP message', async () => {
    reply = (res) =>
      res.end('{"status":"fail","error":{"code":"400","message":"The file arrived damaged"},"data":"null"}')
    const out = await phpRequest({ baseUrl: base, token: 'tok', method: 'POST', body: Buffer.from('x') })
    expect(out.status).toBe('fail')
    expect(out.message).toBe('The file arrived damaged')
  })

  it('an answer that is not JSON is an error, never a success', async () => {
    reply = (res) => {
      res.statusCode = 500
      res.end('<html>Fatal error</html>')
    }
    await expect(phpRequest({ baseUrl: base, token: 'tok', method: 'GET' })).rejects.toThrow(
      /unexpected \(HTTP 500\)/,
    )
  })

  it('an unreachable PHP says so', async () => {
    await expect(
      phpRequest({ baseUrl: 'http://127.0.0.1:1', token: 'tok', method: 'GET', timeoutMs: 2000 }),
    ).rejects.toThrow(/Could not reach the email server/)
  })

  it('a PHP that does not answer in time is cut', async () => {
    reply = () => undefined // never answers
    await expect(
      phpRequest({ baseUrl: base, token: 'tok', method: 'GET', timeoutMs: 300 }),
    ).rejects.toThrow(/took too long|Could not reach/)
  })
})

describe('PunchExportTicketStore background jobs (F3)', () => {
  it('createRunning → done with result, readable by its owner only', () => {
    const store = new PunchExportTicketStore()
    const { ticket } = store.createRunning(7, {} as any, 'invoice-export')
    expect(store.getStatus(ticket, 7, 'invoice-export')).toEqual({ status: 'running' })
    store.markDone(ticket, { idQueue: 1, descripcion: 'x', timeCard: false, sent: true })
    expect(store.getStatus(ticket, 7, 'invoice-export')).toEqual({
      status: 'done',
      result: { idQueue: 1, descripcion: 'x', timeCard: false, sent: true },
    })
    expect(() => store.getStatus(ticket, 8, 'invoice-export')).toThrow()
  })
})
