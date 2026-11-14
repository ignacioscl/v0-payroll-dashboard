/**
 * `onRequestError`: una línea JSON por error, sin encabezados ni cookies, en stderr y en el archivo de errores
 * (plans/plan-buenas-practicas-v0, 2.13.8).
 */
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { reportRequestError } from './report-request-error'
import { appendLogLine } from './error-log-file'

const dir = mkdtempSync(join(tmpdir(), 'next-errors-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const input = {
  error: Object.assign(new Error('boom'), { digest: 'abc123' }),
  request: {
    path: '/billing/invoices?token=xyz',
    method: 'GET',
    headers: { cookie: 'srs_session=SECRET', authorization: 'Bearer SECRET' },
  },
  context: { routePath: '/(dashboard)/billing/invoices', routeType: 'render', renderSource: 'server-rendering' },
}

describe('reportRequestError', () => {
  it('una línea con digest y la ruta sin query, sin encabezados ni cookies, en stderr y en el archivo', () => {
    const path = join(dir, 'errors.log')
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const line = reportRequestError(input, { path })
    const calls = stderr.mock.calls.map((c) => c[0])
    stderr.mockRestore()
    const parsed = JSON.parse(line)
    expect(parsed).toMatchObject({ source: 'next', digest: 'abc123', path: '/billing/invoices', method: 'GET' })
    expect(line).not.toContain('SECRET')
    expect(line).not.toContain('token=xyz')
    expect(calls).toContain(`${line}\n`)
    expect(readFileSync(path, 'utf-8')).toBe(`${line}\n`)
  })

  it('sin permiso de escritura sale igual por stderr', () => {
    const locked = join(dir, 'locked')
    mkdirSync(locked)
    chmodSync(locked, 0o500)
    const writes: string[] = []
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation((s) => {
      writes.push(String(s))
      return true
    })
    try {
      const line = reportRequestError(input, { path: join(locked, 'errors.log') })
      expect(writes).toContain(`${line}\n`)
      expect(existsSync(join(locked, 'errors.log'))).toBe(false)
    } finally {
      stderr.mockRestore()
      chmodSync(locked, 0o700)
    }
  })

  it('rota al pasar el tope', () => {
    const p = join(dir, 'rot.log')
    writeFileSync(p, 'x'.repeat(50))
    appendLogLine('{"a":1}', { path: p, maxBytes: 10, keepFiles: 2 })
    expect(readFileSync(`${p}.1`, 'utf-8')).toBe('x'.repeat(50))
    expect(readFileSync(p, 'utf-8')).toBe('{"a":1}\n')
  })
})
