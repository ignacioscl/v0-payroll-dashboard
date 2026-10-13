import { ForbiddenException, GoneException, NotFoundException } from '@nestjs/common'

import { PunchExportTicketStore } from './punch-export-ticket.store'

const FILTERS = {
  fechaDesde: '2026-01-01',
  fechaHasta: '2026-01-31',
  idDealer: '639',
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('PunchExportTicketStore', () => {
  it('el ticket nace pending y vence si nadie lo consume', async () => {
    const onExpire = jest.fn()
    const store = new PunchExportTicketStore().setTtls(40, 20)
    const { ticket } = store.createPending(10, FILTERS, onExpire)

    expect(store.getStatus(ticket, 10).status).toBe('pending')
    await wait(20)
    expect(store.peek(ticket)?.state).toBe('pending')
    expect(onExpire).not.toHaveBeenCalled()

    await wait(40)
    expect(store.peek(ticket)).toBeUndefined()
    expect(onExpire).toHaveBeenCalledTimes(1)
  })

  it('consumir cancela el TTL de pending y pasa a running; status sigue leyéndolo', async () => {
    const onExpire = jest.fn()
    const store = new PunchExportTicketStore().setTtls(40, 20)
    const { ticket } = store.createPending(10, FILTERS, onExpire)

    const consumed = store.consumeForDownload(ticket, 10)
    expect(consumed.state).toBe('running')
    expect(consumed.filters).toEqual(FILTERS)
    expect(store.getStatus(ticket, 10).status).toBe('running')

    await wait(80)
    expect(onExpire).not.toHaveBeenCalled()
    expect(store.getStatus(ticket, 10).status).toBe('running')
  })

  it('el segundo GET del mismo ticket da 410', () => {
    const store = new PunchExportTicketStore()
    const { ticket } = store.createPending(10, FILTERS, () => undefined)
    store.consumeForDownload(ticket, 10)
    expect(() => store.consumeForDownload(ticket, 10)).toThrow(GoneException)
  })

  it('un ticket de otro usuario da 403', () => {
    const store = new PunchExportTicketStore()
    const { ticket } = store.createPending(10, FILTERS, () => undefined)
    expect(() => store.consumeForDownload(ticket, 99)).toThrow(ForbiddenException)
    expect(() => store.getStatus(ticket, 99)).toThrow(ForbiddenException)
  })

  it('done/error quedan un rato para el poll y después se borran', async () => {
    const store = new PunchExportTicketStore().setTtls(200, 30)
    const { ticket } = store.createPending(10, FILTERS, () => undefined)
    store.consumeForDownload(ticket, 10)
    store.markDone(ticket)

    expect(store.getStatus(ticket, 10).status).toBe('done')
    expect(() => store.consumeForDownload(ticket, 10)).toThrow(GoneException)

    await wait(50)
    expect(() => store.getStatus(ticket, 10)).toThrow(NotFoundException)
  })

  it('markError guarda el mensaje para status', () => {
    const store = new PunchExportTicketStore()
    const { ticket } = store.createPending(10, FILTERS, () => undefined)
    store.consumeForDownload(ticket, 10)
    store.markError(ticket, 'stream failed')
    expect(store.getStatus(ticket, 10)).toEqual({ status: 'error', errorMessage: 'stream failed' })
  })
})
