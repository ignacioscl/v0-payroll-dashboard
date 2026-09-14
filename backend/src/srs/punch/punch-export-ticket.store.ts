import { randomUUID } from 'crypto'
import {
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'

import type { DealerRankingStatus } from './dto/punch-dealer-ranking.dto'
import type { PunchListLiveStatus } from './dto/punch-list.dto'

export type PunchExportTicketState = 'pending' | 'running' | 'done' | 'error'

/**
 * Qué export emitió el ticket. El store y el semáforo son UNO SOLO para los dos
 * exports (el cupo protege el pool de 5 conexiones), así que el ticket lleva su
 * tipo: uno de Punch Report nunca se descarga por la ruta del ranking de dealers,
 * ni al revés. El default es `punch-list`, así las llamadas de P4 no cambian.
 */
export type PunchExportTicketKind = 'punch-list' | 'dealer-ranking'

export type PunchExportStoredFilters = {
  fechaDesde: string
  fechaHasta: string
  idDealer: string
  minHours?: number
  maxHours?: number
  /** Ids YA parseados y validados (parsePaymentTypeIds + catalogo del provider). */
  idPaymentTypes?: readonly number[]
  search?: string
  idEmployee?: number
  issueType?: string
  /** CSV canónico de la lista blanca; se guarda tal cual llegó al `prepare`. */
  errorTypes?: string
  /** Union, no `string`: el replay se lo pasa directo a `PunchListSqlOpts`. */
  todayLiveStatus?: PunchListLiveStatus
}

/** Filtros del export del ranking de dealers del Dashboard, tal cual pasaron el `prepare`. */
export type DealerRankingExportStoredFilters = {
  fechaDesde: string
  fechaHasta: string
  idDealer: string
  /** CSV canónico de la lista blanca; se guarda tal cual llegó al `prepare`. */
  errorTypes?: string
  search?: string
  /** Posición del switch Pending/Corrected al momento del click. */
  status: DealerRankingStatus
}

export type PunchExportTicket = {
  id: string
  idUsuario: number
  kind: PunchExportTicketKind
  filters: PunchExportStoredFilters | DealerRankingExportStoredFilters
  state: PunchExportTicketState
  errorMessage?: string
  createdAt: number
  pendingTimer: ReturnType<typeof setTimeout> | null
  terminalTimer: ReturnType<typeof setTimeout> | null
  onExpirePending: () => void
}

const DEFAULT_PENDING_TTL_MS = 60_000
const DEFAULT_TERMINAL_TTL_MS = 15_000

@Injectable()
export class PunchExportTicketStore {
  private readonly tickets = new Map<string, PunchExportTicket>()
  private pendingTtlMs = DEFAULT_PENDING_TTL_MS
  private terminalTtlMs = DEFAULT_TERMINAL_TTL_MS

  /** Test hook — Nest constructs this with no args. */
  setTtls(pendingTtlMs: number, terminalTtlMs: number): this {
    this.pendingTtlMs = pendingTtlMs
    this.terminalTtlMs = terminalTtlMs
    return this
  }

  createPending(
    idUsuario: number,
    filters: PunchExportStoredFilters | DealerRankingExportStoredFilters,
    onExpirePending: () => void,
    kind: PunchExportTicketKind = 'punch-list',
  ): { ticket: string; expiresAt: string } {
    const id = randomUUID()
    const ticket: PunchExportTicket = {
      id,
      idUsuario,
      kind,
      filters,
      state: 'pending',
      createdAt: Date.now(),
      pendingTimer: null,
      terminalTimer: null,
      onExpirePending,
    }
    ticket.pendingTimer = setTimeout(() => this.expirePending(id), this.pendingTtlMs)
    ticket.pendingTimer.unref?.()
    this.tickets.set(id, ticket)
    return { ticket: id, expiresAt: new Date(Date.now() + this.pendingTtlMs).toISOString() }
  }

  peek(id: string): PunchExportTicket | undefined {
    return this.tickets.get(id)
  }

  consumeForDownload(
    id: string,
    idUsuario: number,
    kind: PunchExportTicketKind = 'punch-list',
  ): PunchExportTicket {
    const ticket = this.requireOwned(id, idUsuario, kind)
    if (ticket.state !== 'pending') {
      throw new GoneException('Export ticket already used')
    }
    if (ticket.pendingTimer) {
      clearTimeout(ticket.pendingTimer)
      ticket.pendingTimer = null
    }
    ticket.state = 'running'
    return ticket
  }

  getStatus(
    id: string,
    idUsuario: number,
    kind: PunchExportTicketKind = 'punch-list',
  ): { status: PunchExportTicketState; errorMessage?: string } {
    const ticket = this.requireOwned(id, idUsuario, kind)
    return { status: ticket.state, errorMessage: ticket.errorMessage }
  }

  markDone(id: string): void {
    const ticket = this.tickets.get(id)
    if (!ticket || ticket.state === 'done' || ticket.state === 'error') return
    ticket.state = 'done'
    this.scheduleDelete(ticket)
  }

  markError(id: string, message: string): void {
    const ticket = this.tickets.get(id)
    if (!ticket || ticket.state === 'done' || ticket.state === 'error') return
    ticket.state = 'error'
    ticket.errorMessage = message
    this.scheduleDelete(ticket)
  }

  private expirePending(id: string): void {
    const ticket = this.tickets.get(id)
    if (!ticket || ticket.state !== 'pending') return
    ticket.onExpirePending()
    this.tickets.delete(id)
  }

  private scheduleDelete(ticket: PunchExportTicket): void {
    if (ticket.terminalTimer) clearTimeout(ticket.terminalTimer)
    ticket.terminalTimer = setTimeout(() => {
      this.tickets.delete(ticket.id)
    }, this.terminalTtlMs)
    ticket.terminalTimer.unref?.()
  }

  private requireOwned(
    id: string,
    idUsuario: number,
    kind: PunchExportTicketKind,
  ): PunchExportTicket {
    const ticket = this.tickets.get(id)
    // Un ticket del otro export responde igual que uno que no existe: por esta
    // ruta, no existe. No se consume ni se toca: su propia ruta lo sigue sirviendo.
    if (!ticket || ticket.kind !== kind) {
      throw new NotFoundException('Export ticket not found')
    }
    if (ticket.idUsuario !== idUsuario) {
      throw new ForbiddenException('Forbidden')
    }
    return ticket
  }
}
