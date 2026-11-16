/**
 * Ninguna ruta devuelve al navegador el HTML del PHP (plans/plan-buenas-practicas-v0, 2.13.12): `/api/auth/me`,
 * `/api/dealers` y el SSO responden el texto de D1 y dejan el detalle en el log del servidor.
 */
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/session', () => ({
  getSrsSession: async () => ({ token: 'tok', user: {} }),
}))

import { GET as meGET } from '@/app/api/auth/me/route'
import { GET as dealersGET } from '@/app/api/dealers/route'
import { exchangeSsoCode } from '@/lib/srs-api'
import { UPSTREAM_UNEXPECTED_MESSAGE } from '@/lib/upstream-error'

const HTML = '<html><body><b>Fatal error</b>: PDOException in /home/srssui5/public_html/php/utils/DB_connect.php</body></html>'
let server: http.Server

beforeAll(async () => {
  server = http.createServer((_req, res) => res.writeHead(500, { 'Content-Type': 'text/html' }).end(HTML))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  process.env.SRS_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  process.env.SRS_SSO_SECRET = 'test-secret'
  delete process.env.SRS_API_HOST
  delete process.env.SRS_PUBLIC_URL
})
afterAll(async () => {
  await new Promise((r) => server.close(r))
})

describe('upstream que devuelve HTML', () => {
  it('/api/auth/me responde el texto de D1 sin el HTML', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const res = await meGET()
    log.mockRestore()
    const text = await res.text()
    expect(JSON.parse(text).error).toBe(UPSTREAM_UNEXPECTED_MESSAGE)
    expect(text).not.toContain('PDOException')
  })

  it('/api/dealers responde el texto de D1 sin el HTML', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const res = await dealersGET()
    log.mockRestore()
    const text = await res.text()
    expect(JSON.parse(text).error).toBe(UPSTREAM_UNEXPECTED_MESSAGE)
    expect(text).not.toContain('PDOException')
  })

  it('exchangeSsoCode tira con el texto de D1 sin el HTML', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(exchangeSsoCode('abc')).rejects.toThrow(UPSTREAM_UNEXPECTED_MESSAGE)
    log.mockRestore()
  })
})
