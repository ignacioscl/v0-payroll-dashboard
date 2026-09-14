import { ForbiddenException, NotFoundException } from '@nestjs/common'

import {
  PunchExportTicketStore,
  type DealerRankingExportStoredFilters,
} from './punch-export-ticket.store'

const PUNCH_LIST_FILTERS = {
  fechaDesde: '2026-04-01',
  fechaHasta: '2026-05-31',
  idDealer: '85',
}

const RANKING_FILTERS: DealerRankingExportStoredFilters = {
  ...PUNCH_LIST_FILTERS,
  errorTypes: '1,3',
  status: 'corrected',
}

/*
 * El store y el semáforo son uno solo para los dos exports. Lo que impide que un
 * ticket se descargue por la ruta del otro es el `kind`: los specs de P4
 * (punch-export-ticket.store.spec.ts) siguen corriendo sin cambios con el default.
 */
describe('PunchExportTicketStore — kind del ticket', () => {
  it('un ticket del ranking no se descarga ni se consulta por la ruta de Punch Report: 404', () => {
    const store = new PunchExportTicketStore()
    const { ticket } = store.createPending(10, RANKING_FILTERS, () => undefined, 'dealer-ranking')

    expect(() => store.consumeForDownload(ticket, 10)).toThrow(NotFoundException)
    expect(() => store.consumeForDownload(ticket, 10, 'punch-list')).toThrow(NotFoundException)
    expect(() => store.getStatus(ticket, 10)).toThrow(NotFoundException)
  })

  it('un ticket de Punch Report no se descarga ni se consulta por la ruta del ranking: 404', () => {
    const store = new PunchExportTicketStore()
    const { ticket } = store.createPending(10, PUNCH_LIST_FILTERS, () => undefined)

    expect(() => store.consumeForDownload(ticket, 10, 'dealer-ranking')).toThrow(NotFoundException)
    expect(() => store.getStatus(ticket, 10, 'dealer-ranking')).toThrow(NotFoundException)
  })

  it('el 404 por kind no consume el ticket: su propia ruta lo sigue descargando', () => {
    const store = new PunchExportTicketStore()
    const { ticket } = store.createPending(10, RANKING_FILTERS, () => undefined, 'dealer-ranking')

    expect(() => store.consumeForDownload(ticket, 10)).toThrow(NotFoundException)
    expect(store.peek(ticket)?.state).toBe('pending')

    const consumed = store.consumeForDownload(ticket, 10, 'dealer-ranking')
    expect(consumed.state).toBe('running')
    expect(consumed.kind).toBe('dealer-ranking')
    expect(consumed.filters).toEqual(RANKING_FILTERS)
    expect(store.getStatus(ticket, 10, 'dealer-ranking').status).toBe('running')
  })

  it('el kind se mira antes que el dueño: un ticket ajeno del otro export da 404, no 403', () => {
    const store = new PunchExportTicketStore()
    const { ticket } = store.createPending(10, RANKING_FILTERS, () => undefined, 'dealer-ranking')

    expect(() => store.consumeForDownload(ticket, 99)).toThrow(NotFoundException)
    expect(() => store.consumeForDownload(ticket, 99, 'dealer-ranking')).toThrow(ForbiddenException)
  })

  it('sin kind explícito el ticket es de Punch Report: las llamadas de P4 no cambian', () => {
    const store = new PunchExportTicketStore()
    const { ticket } = store.createPending(10, PUNCH_LIST_FILTERS, () => undefined)

    expect(store.peek(ticket)?.kind).toBe('punch-list')
    expect(store.getStatus(ticket, 10).status).toBe('pending')
    expect(store.consumeForDownload(ticket, 10).state).toBe('running')
  })
})
