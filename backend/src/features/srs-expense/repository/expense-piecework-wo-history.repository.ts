import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { ExpensePieceworkWoHistory } from '../entity/expense-piecework-wo-history.entity'
import type { PieceworkUnitKey } from './expense-piecework-wo.repository'

/** Una fila del histórico tal como la muestra Edit de la expense. */
export interface PieceworkHistoryEntry {
  id: number
  createdAt: string
  idInvoice: number
  nro: string
  service: string
  oldAmount: string | null
  newAmount: string
  oldDealer: { id: number; name: string } | null
  newDealer: { id: number; name: string }
  oldWorkDate: string | null
  newWorkDate: string
  reason: string
  detail: string | null
  source: string
  /** En Edit, el usuario; de noche, el último que editó la WO. */
  changedBy: { id: number; name: string } | null
  woChangedAt: string | null
}

/**
 * EXP_EXPENSE_PIECEWORK_WO_HISTORY (migration 034, T5b): alta y lectura del histórico de una expense Piecework. Toda
 * lectura une con EXP_EXPENSE de la empresa (`id_detailer`).
 */
@Injectable()
export class ExpensePieceworkWoHistoryRepository {
  constructor(@InjectRepository(ExpensePieceworkWoHistory) private readonly repo: Repository<ExpensePieceworkWoHistory>) {}

  async insertMany(rows: Omit<ExpensePieceworkWoHistory, 'id' | 'createdAt'>[]): Promise<void> {
    if (!rows.length) return
    await this.repo.save(rows.map((r) => this.repo.create(r)))
  }

  /** El histórico de la expense (todas las filas de su grupo), el más nuevo arriba. */
  async listForUnit(idDetailer: number, unit: PieceworkUnitKey): Promise<PieceworkHistoryEntry[]> {
    const rows: Record<string, unknown>[] = await this.repo.query(
      `SELECT h.id, DATE_FORMAT(h.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt, h.id_invoice AS idInvoice,
              i.full_nro AS nro, IFNULL(s.nombre, '') AS service,
              h.old_amount AS oldAmount, h.new_amount AS newAmount,
              h.old_id_dealer AS oldIdDealer, GET_DEALER_NAME_BY_PROVIDER(?, h.old_id_dealer) AS oldDealer,
              h.new_id_dealer AS newIdDealer, GET_DEALER_NAME_BY_PROVIDER(?, h.new_id_dealer) AS newDealer,
              DATE_FORMAT(h.old_work_date, '%Y-%m-%d') AS oldWorkDate, DATE_FORMAT(h.new_work_date, '%Y-%m-%d') AS newWorkDate,
              h.reason, h.detail, h.source,
              IFNULL(h.id_usuario, h.wo_changed_by) AS changedById, u.nombre AS changedByName,
              DATE_FORMAT(h.wo_changed_at, '%Y-%m-%d %H:%i:%s') AS woChangedAt
         FROM EXP_EXPENSE_PIECEWORK_WO_HISTORY h
         JOIN EXP_EXPENSE e ON e.id = h.id_expense AND e.id_detailer = ?
         JOIN EXP_EXPENSE_PIECEWORK_WO pw ON pw.id = h.id_piecework_wo
         JOIN INVOICE i ON i.id = h.id_invoice
         LEFT JOIN INVOICE_SERVICE s ON s.id = pw.id_invoice_service
         LEFT JOIN usuarios u ON u.id_usuario = IFNULL(h.id_usuario, h.wo_changed_by)
        WHERE ${'idExpGroup' in unit ? 'e.id_exp_group = ?' : 'e.id = ?'}
        ORDER BY h.id DESC`,
      [idDetailer, idDetailer, idDetailer, 'idExpGroup' in unit ? unit.idExpGroup : unit.idExpense],
    )
    return rows.map((r) => ({
      id: Number(r.id),
      createdAt: String(r.createdAt),
      idInvoice: Number(r.idInvoice),
      nro: String(r.nro ?? ''),
      service: String(r.service ?? ''),
      oldAmount: r.oldAmount === null ? null : String(r.oldAmount),
      newAmount: String(r.newAmount),
      oldDealer: r.oldIdDealer === null ? null : { id: Number(r.oldIdDealer), name: String(r.oldDealer ?? r.oldIdDealer) },
      newDealer: { id: Number(r.newIdDealer), name: String(r.newDealer ?? r.newIdDealer) },
      oldWorkDate: r.oldWorkDate === null ? null : String(r.oldWorkDate),
      newWorkDate: String(r.newWorkDate),
      reason: String(r.reason),
      detail: r.detail === null ? null : String(r.detail),
      source: String(r.source),
      changedBy: r.changedById === null ? null : { id: Number(r.changedById), name: String(r.changedByName ?? r.changedById) },
      woChangedAt: r.woChangedAt === null ? null : String(r.woChangedAt),
    }))
  }
}
