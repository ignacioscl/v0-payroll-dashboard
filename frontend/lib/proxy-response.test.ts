import { describe, expect, it } from 'vitest'
import { proxyResponseBody } from './proxy-response'

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
