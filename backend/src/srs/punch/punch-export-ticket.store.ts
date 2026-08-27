import { randomUUID } from 'crypto'
import {
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'

export type PunchExportTicketState = 'pending' | 'running' | 'done' | 'error'

export type PunchExportStoredFilters = {
  fechaDesde: string
  fechaHasta: string
  idDealer: string
  minHours?: number
  maxHours?: number
  idPaymentType?: number
  search?: string
  idEmployee?: number
  issueType?: string
  todayLiveStatus?: string
}

export type PunchExportTicket = {
  id: string
  idUsuario: number
  filters: PunchExportStoredFilters
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
    filters: PunchExportStoredFilters,
    onExpirePending: () => void,
  ): { ticket: string; expiresAt: string } {
    const id = randomUUID()
    const ticket: PunchExportTicket = {
      id,
      idUsuario,
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

  consumeForDownload(id: string, idUsuario: number): PunchExportTicket {
    const ticket = this.requireOwned(id, idUsuario)
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
  ): { status: PunchExportTicketState; errorMessage?: string } {
    const ticket = this.requireOwned(id, idUsuario)
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

  private requireOwned(id: string, idUsuario: number): PunchExportTicket {
    const ticket = this.tickets.get(id)
    if (!ticket) {
      throw new NotFoundException('Export ticket not found')
    }
    if (ticket.idUsuario !== idUsuario) {
      throw new ForbiddenException('Forbidden')
    }
    return ticket
  }
}
