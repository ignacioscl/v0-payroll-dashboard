import { describe, expect, it } from 'vitest'
import { proxyResponseBody, securityHeadersFrom } from './proxy-response'

describe('proxyResponseBody', () => {
  it('un 204 del backend se puede devolver sin que Response tire error', () => {
    const body = new ArrayBuffer(0)
    expect(() => new Response(body, { status: 204 })).toThrow()
    const res = new Response(proxyResponseBody(204, body), { status: 204 })
    expect(res.status).toBe(204)
  })

  it('las demás respuestas conservan su cuerpo', async () => {
    const body = new TextEncoder().encode('{"ok":true}').buffer as ArrayBuffer
    const res = new Response(proxyResponseBody(200, body), { status: 200 })
    expect(await res.text()).toBe('{"ok":true}')
  })
})

describe('securityHeadersFrom', () => {
  it('copia la CSP que encierra (sandbox) y nosniff', () => {
    const up = new Response('x', {
      headers: {
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'X-Content-Type-Options': 'nosniff',
      },
    })
    expect(securityHeadersFrom(up)).toEqual({
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    })
  })

  it('no copia la CSP general de helmet', () => {
    const up = new Response('x', { headers: { 'Content-Security-Policy': "default-src 'self'" } })
    expect(securityHeadersFrom(up)).toEqual({})
  })
})
