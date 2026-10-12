import http from 'node:http'
import https from 'node:https'
import { randomBytes } from 'node:crypto'

/**
 * Server-to-server call from Nest to the PHP of main for Send Email / Create File of the invoices
 * export (plans/plan-export-invoices-nest §8.7, D33). Same headers the Next proxy uses to talk to
 * the PHP (`Authorization: <PHP token>`, `App-name: SRS-WEB`, FE/lib/srs-proxy.ts).
 *
 * node:http instead of fetch: fetch (undici) cuts at 300 s waiting for the headers, and the PHP may
 * take longer when it builds a big Time Card and sends to several recipients. Here the limit is the
 * explicit 10 minutes of §2.1.8.
 */

export const PHP_DISPATCH_PATH = '/php/api/payroll/invoice-export-queue-dispatch.php'
export const PHP_DISPATCH_TIMEOUT_MS = 10 * 60_000

export type PhpResponse<T> = { status: 'success' | 'fail'; message: string; data: T | null }

type MultipartField = { name: string; value: string }
type MultipartFile = { name: string; filename: string; contentType: string; content: Buffer }

/**
 * The whole multipart/form-data body in one Buffer, so its exact size is known before posting it:
 * post_max_size limits the WHOLE body, fields included, not only the file (M3 of the v12 review).
 */
export function buildMultipart(
  fields: MultipartField[],
  file: MultipartFile,
): { body: Buffer; contentType: string } {
  const boundary = `----srsInvoiceExport${randomBytes(12).toString('hex')}`
  const parts: Buffer[] = []
  for (const f of fields) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${f.name}"\r\n\r\n${f.value}\r\n`,
        'utf8',
      ),
    )
  }
  const safeName = file.filename.replace(/["\r\n]/g, '')
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${safeName}"\r\n` +
        `Content-Type: ${file.contentType}\r\n\r\n`,
      'utf8',
    ),
    file.content,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
  )
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` }
}

/** One request to the PHP; the JSON of ErrorManager, or an Error that says what happened. */
export function phpRequest<T>(opts: {
  baseUrl: string
  token: string
  method: 'GET' | 'POST'
  body?: Buffer
  contentType?: string
  timeoutMs?: number
}): Promise<PhpResponse<T>> {
  const url = new URL(PHP_DISPATCH_PATH, `${opts.baseUrl.replace(/\/$/, '')}/`)
  const lib = url.protocol === 'https:' ? https : http
  const headers: Record<string, string | number> = {
    Authorization: opts.token,
    'App-name': 'SRS-WEB',
    Accept: 'application/json',
  }
  if (opts.body) {
    headers['Content-Type'] = opts.contentType ?? 'application/octet-stream'
    headers['Content-Length'] = opts.body.length
  }
  return new Promise((resolve, reject) => {
    const req = lib.request(url, { method: opts.method, headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let parsed: any
        try {
          parsed = JSON.parse(text)
        } catch {
          reject(new Error(`The email server answered something unexpected (HTTP ${res.statusCode}).`))
          return
        }
        resolve({
          status: parsed?.status === 'success' ? 'success' : 'fail',
          message: String(parsed?.error?.message ?? ''),
          data: (parsed?.data ?? null) as T | null,
        })
      })
      res.on('error', reject)
    })
    req.setTimeout(opts.timeoutMs ?? PHP_DISPATCH_TIMEOUT_MS, () => {
      req.destroy(new Error('The email server took too long to answer.'))
    })
    req.on('error', (e) => reject(new Error(`Could not reach the email server: ${e.message}`)))
    if (opts.body) req.write(opts.body)
    req.end()
  })
}
