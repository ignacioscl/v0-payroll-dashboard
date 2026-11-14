/**
 * Tiempo máximo de los pedidos del servidor de Next (plans/plan-buenas-practicas-v0, 2.13.5): cortan hasta los
 * encabezados y nunca a mitad de una descarga. Contra servidores locales; los tiempos bajados con `vi.mock`.
 */
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/upstream-timeouts', () => ({
  SRS_ME_TIMEOUT_MS: 300,
  SRS_SSO_TIMEOUT_MS: 300,
  SRS_PROXY_TIMEOUT_MS: 300,
  BACKEND_TIMEOUT_MS: 300,
  NODE_TICKETS_TIMEOUT_MS: 300,
  FACE_TIMEOUT_MS: 300,
}))
vi.mock('@/lib/auth/session', () => ({
  getSrsSession: async () => ({ token: 'tok', user: { idDealerProvider: 0, isCompanyTypeCompany: false } }),
}))

import { fetchSrsUpstream } from '@/lib/srs-upstream'
import { forwardToSrs } from '@/lib/srs-proxy'
import { fetchBackend } from '@/lib/backend-upstream'
import { forwardToFace } from '@/lib/face/face-proxy'
import { fetchNodeTickets } from '@/lib/expense-attachments-server'
import { UPSTREAM_TIMEOUT_MESSAGE, UPSTREAM_UNREACHABLE_MESSAGE } from '@/lib/upstream-error'

const LIMIT = 300

let silent: http.Server
let slowBody: http.Server
const openSockets = new Set<import('node:net').Socket>()
let silentUrl: string
let slowBodyUrl: string
let closedUrl: string

function listen(server: http.Server): Promise<string> {
  server.on('connection', (s) => {
    openSockets.add(s)
    s.on('close', () => openSockets.delete(s))
  })
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)))
}

beforeAll(async () => {
  // Nunca manda los encabezados.
  silent = http.createServer(() => undefined)
  silentUrl = await listen(silent)
  // Encabezados enseguida y el body en partes durante más que el límite (un export).
  slowBody = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    let n = 0
    const timer = setInterval(() => {
      res.write(`chunk${n}\n`)
      if (++n === 8) {
        clearInterval(timer)
        res.end('end\n')
      }
    }, 100)
  })
  slowBodyUrl = await listen(slowBody)
  const tmp = http.createServer()
  const url = await listen(tmp)
  await new Promise((r) => tmp.close(r))
  closedUrl = url
})

afterAll(async () => {
  openSockets.forEach((s) => s.destroy())
  await Promise.all([silent, slowBody].map((s) => new Promise((r) => s.close(r))))
})

beforeEach(() => {
  delete process.env.SRS_API_HOST
  delete process.env.SRS_PUBLIC_URL
})

async function expectTimeout(p: Promise<unknown>) {
  const started = Date.now()
  await expect(p).rejects.toMatchObject({ name: 'TimeoutError' })
  expect(Date.now() - started).toBeLessThan(LIMIT + 1500)
}

describe('sin encabezados: corta con TimeoutError', () => {
  it('fetchSrsUpstream, rama fetch', async () => {
    process.env.SRS_API_URL = silentUrl
    await expectTimeout(fetchSrsUpstream('/php/api/x.php', undefined, { timeoutMs: LIMIT }))
  })

  it('fetchSrsUpstream, rama node:http (vhost distinto)', async () => {
    process.env.SRS_API_URL = silentUrl
    process.env.SRS_API_HOST = 'srs.test'
    await expectTimeout(fetchSrsUpstream('/php/api/x.php', undefined, { timeoutMs: LIMIT }))
  })

  it('fetchBackend', async () => {
    process.env.BACKEND_API_URL = silentUrl
    await expectTimeout(fetchBackend('api/srs/x', 'tok'))
  })

  it('fetchNodeTickets', async () => {
    await expectTimeout(fetchNodeTickets(`${silentUrl}/expenses/tickets/1/2`, { method: 'GET' }))
  })

  it('forwardToFace responde 504 con el texto de D1', async () => {
    process.env.FACE_RECOGNITION_URL = silentUrl
    const res = await forwardToFace({ method: 'GET', pathSegments: ['photos'] })
    expect(res.status).toBe(504)
    expect(await res.json()).toEqual({ error: UPSTREAM_TIMEOUT_MESSAGE })
  })

  it('forwardToSrs responde 504 con el texto de D1', async () => {
    process.env.SRS_API_URL = silentUrl
    const res = await forwardToSrs({ method: 'GET', pathSegments: ['php', 'api', 'x.php'] })
    expect(res.status).toBe(504)
    expect(await res.json()).toEqual({ error: UPSTREAM_TIMEOUT_MESSAGE })
  })
})

describe('puerto cerrado: 502', () => {
  it('forwardToSrs', async () => {
    process.env.SRS_API_URL = closedUrl
    const res = await forwardToSrs({ method: 'GET', pathSegments: ['php', 'api', 'x.php'] })
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: UPSTREAM_UNREACHABLE_MESSAGE })
  })

  it('forwardToFace', async () => {
    process.env.FACE_RECOGNITION_URL = closedUrl
    const res = await forwardToFace({ method: 'GET', pathSegments: ['photos'] })
    expect(res.status).toBe(502)
  })
})

describe('una descarga que ya empezó no se corta', () => {
  const whole = `${Array.from({ length: 8 }, (_, i) => `chunk${i}\n`).join('')}end\n`

  it('rama fetch', async () => {
    process.env.SRS_API_URL = slowBodyUrl
    const res = await fetchSrsUpstream('/export', undefined, { timeoutMs: LIMIT })
    expect(await res.text()).toBe(whole)
  })

  it('rama node:http', async () => {
    process.env.SRS_API_URL = slowBodyUrl
    process.env.SRS_API_HOST = 'srs.test'
    const res = await fetchSrsUpstream('/export', undefined, { timeoutMs: LIMIT })
    expect(await res.text()).toBe(whole)
  })

  it('fetchBackend y fetchNodeTickets', async () => {
    process.env.BACKEND_API_URL = slowBodyUrl
    expect(await (await fetchBackend('api/srs/export', 'tok')).text()).toBe(whole)
    expect(await (await fetchNodeTickets(`${slowBodyUrl}/file.pdf`, { method: 'GET' })).text()).toBe(whole)
  })
})
