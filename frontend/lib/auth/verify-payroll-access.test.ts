/**
 * Con el PHP colgado, caído o con la base caída, la sesión no se borra: tira `UpstreamUnavailableError` y sale la
 * tarjeta de error (plans/plan-buenas-practicas-v0, 2.13.6). 403 y JSON inválido siguen como antes.
 */
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/upstream-timeouts', () => ({
  SRS_ME_TIMEOUT_MS: 300,
  SRS_SSO_TIMEOUT_MS: 300,
  SRS_PROXY_TIMEOUT_MS: 300,
  BACKEND_TIMEOUT_MS: 300,
  NODE_TICKETS_TIMEOUT_MS: 300,
  FACE_TIMEOUT_MS: 300,
}))
vi.mock('@/lib/auth/session', () => ({
  getSrsSession: async () => ({ token: 'tok', user: {} }),
}))

import { checkPayrollDashboardAccess } from './verify-payroll-access'
import { UpstreamUnavailableError } from '@/lib/upstream-error'

let mode: 'hang' | '503' | 'html500' | 'forbidden' | 'badjson' | 'ok' = 'ok'
let server: http.Server
const sockets = new Set<import('node:net').Socket>()

beforeAll(async () => {
  server = http.createServer((_req, res) => {
    if (mode === 'hang') return
    if (mode === '503') return void res.writeHead(503).end('Service Unavailable')
    if (mode === 'html500') return void res.writeHead(500, { 'Content-Type': 'text/html' }).end('<b>PDOException</b>')
    res.writeHead(200, { 'Content-Type': 'application/json' })
    if (mode === 'forbidden') return void res.end(JSON.stringify({ status: 'fail', error: { code: 403 } }))
    if (mode === 'badjson') return void res.end('<html>not json</html>')
    res.end(JSON.stringify({ status: 'success', data: { user: { id: 1 } } }))
  })
  server.on('connection', (s) => {
    sockets.add(s)
    s.on('close', () => sockets.delete(s))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  process.env.SRS_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  delete process.env.SRS_API_HOST
  delete process.env.SRS_PUBLIC_URL
})

afterAll(async () => {
  sockets.forEach((s) => s.destroy())
  await new Promise((r) => server.close(r))
})

describe('checkPayrollDashboardAccess', () => {
  it.each(['hang', '503', 'html500'] as const)('me.php %s → UpstreamUnavailableError (no «invalid»)', async (m) => {
    mode = m
    await expect(checkPayrollDashboardAccess()).rejects.toBeInstanceOf(UpstreamUnavailableError)
  })

  it('200 con error.code 403 sigue «forbidden»', async () => {
    mode = 'forbidden'
    await expect(checkPayrollDashboardAccess()).resolves.toBe('forbidden')
  })

  it('200 con JSON inválido sigue «invalid»', async () => {
    mode = 'badjson'
    await expect(checkPayrollDashboardAccess()).resolves.toBe('invalid')
  })

  it('200 con el usuario: «ok»', async () => {
    mode = 'ok'
    await expect(checkPayrollDashboardAccess()).resolves.toBe('ok')
  })
})
