import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authorize = vi.fn()
const deny = vi.fn()
const log = vi.fn()

vi.mock('@/lib/expense-attachments-server', () => ({
  authorizeAttachmentAccess: (...a: unknown[]) => authorize(...a),
  denyAttachmentUpload: (...a: unknown[]) => deny(...a),
  logAttachmentUpload: (...a: unknown[]) => log(...a),
  nodeTicketsUrl: () => 'http://node/tickets',
}))

import { POST } from '@/app/api/expense-attachments/[idDealer]/[idExpense]/route'

const context = { params: Promise.resolve({ idDealer: '408', idExpense: '1' }) }
const request = () => new NextRequest('http://local/x', { method: 'POST', body: '{"img":"x"}' })

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
})
