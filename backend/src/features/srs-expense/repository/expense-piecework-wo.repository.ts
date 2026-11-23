import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'

import { ExpensePieceworkWo } from '../entity/expense-piecework-wo.entity'

/** Una expense Piecework: el grupo (repartida entre dealers) o la expense suelta. */
export type PieceworkUnitKey = { idExpGroup: number } | { idExpense: number }

/** Una WO de un vendor que ya está en una expense Piecework activa. */
export interface TakenWorkOrder {
  idInvoice: number
  idEmployee: number
  idExpense: number
}

/**
 * EXP_EXPENSE_PIECEWORK_WO (migration 032): alta de las filas y la regla «una WO en una sola expense Piecework activa».
 * Toda lectura une con EXP_EXPENSE de la empresa (`id_detailer`): el tenant sale siempre de la sesión.
 */
@Injectable()
export class ExpensePieceworkWoRepository {
  constructor(@InjectRepository(ExpensePieceworkWo) private readonly repo: Repository<ExpensePieceworkWo>) {}

  /** Alta (dentro de la transacción del facade: el repositorio usa el manager de typeorm-transactional). */
  insertMany(rows: Omit<ExpensePieceworkWo, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>[]): Promise<ExpensePieceworkWo[]> {
    if (!rows.length) return Promise.resolve([])
    return this.repo.save(rows.map((r) => this.repo.create(r)))
  }

  /**
   * Alta con `checked_at` = la hora de la base (`NOW()`): la fila nace revisada, con sus `src_*` (alta, Edit y la noche;
   * CODE-review-T5 R3).
   */
  async insertManyChecked(rows: Omit<ExpensePieceworkWo, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>[]): Promise<ExpensePieceworkWo[]> {
    const saved = await this.insertMany(rows)
    if (saved.length) await this.repo.update({ id: In(saved.map((s) => s.id as number)) }, { checkedAt: () => 'NOW()' })
    return saved
  }

  /**
   * De las WO pedidas (o de todas, con `invoiceIds` null), las de `idEmployee` que ya están en una expense Piecework
   * activa de la empresa. `exceptExpenseIds`: las filas de la propia expense (Restore) no cuentan.
   */
  async takenWorkOrders(
    idDetailer: number,
    idEmployee: number,
    invoiceIds: readonly number[] | null,
    exceptExpenseIds: readonly number[] = [],
  ): Promise<TakenWorkOrder[]> {
    if (invoiceIds && !invoiceIds.length) return []
    const byIds = invoiceIds ? ` AND pw.id_invoice IN (${invoiceIds.map(() => '?').join(',')})` : ''
    const except = exceptExpenseIds.length ? ` AND pw.id_expense NOT IN (${exceptExpenseIds.map(() => '?').join(',')})` : ''
    const rows: { idInvoice: unknown; idEmployee: unknown; idExpense: unknown }[] = await this.repo.query(
      `SELECT DISTINCT pw.id_invoice AS idInvoice, pw.id_employee AS idEmployee, pw.id_expense AS idExpense
         FROM EXP_EXPENSE_PIECEWORK_WO pw
         JOIN EXP_EXPENSE e ON e.id = pw.id_expense AND e.estado = 1 AND e.id_detailer = ?
        WHERE pw.deleted_at IS NULL AND pw.id_employee = ?${byIds}${except}`,
      [idDetailer, idEmployee, ...(invoiceIds ?? []), ...exceptExpenseIds],
    )
    return rows.map((r) => ({ idInvoice: Number(r.idInvoice), idEmployee: Number(r.idEmployee), idExpense: Number(r.idExpense) }))
  }

  /**
   * T5b, la noche: las expenses (la unidad = el grupo, o la expense suelta) que tienen alguna fila sin liberar con la
   * fecha guardada en [desde, hasta] **o** cuya WO tiene hoy la fecha de alta en ese rango (las que llegaron de otro pay
   * period). Solo expenses activas de la empresa; aprobadas también (D19).
   */
  async unitsTouchingPeriod(idDetailer: number, desde: string, hasta: string): Promise<PieceworkUnitKey[]> {
    const rows: { idExpGroup: unknown; idExpense: unknown }[] = await this.repo.query(
      `SELECT DISTINCT e.id_exp_group AS idExpGroup, IF(e.id_exp_group IS NULL, e.id, NULL) AS idExpense
         FROM EXP_EXPENSE_PIECEWORK_WO pw
         JOIN EXP_EXPENSE e ON e.id = pw.id_expense AND e.estado = 1 AND e.id_detailer = ?
         JOIN INVOICE i ON i.id = pw.id_invoice
        WHERE pw.deleted_at IS NULL
          AND ((pw.work_date BETWEEN ? AND ?)
               OR (i.fecha_alta >= ? AND i.fecha_alta < DATE_ADD(?, INTERVAL 1 DAY)))`,
      [idDetailer, desde, hasta, desde, hasta],
    )
    return rows.map((r) => (r.idExpGroup !== null && r.idExpGroup !== undefined ? { idExpGroup: Number(r.idExpGroup) } : { idExpense: Number(r.idExpense) }))
  }

  /** Las filas sin liberar de una unidad (todas sus filas de EXP_EXPENSE activas), de la empresa. */
  async activeRowsOfUnit(idDetailer: number, unit: PieceworkUnitKey): Promise<ExpensePieceworkWo[]> {
    const qb = this.repo
      .createQueryBuilder('pw')
      .innerJoin('EXP_EXPENSE', 'e', 'e.id = pw.id_expense AND e.id_detailer = :det AND e.estado = 1', { det: idDetailer })
    if ('idExpGroup' in unit) qb.where('e.id_exp_group = :g', { g: unit.idExpGroup })
    else qb.where('e.id = :id', { id: unit.idExpense })
    return qb.orderBy('pw.id', 'ASC').getMany()
  }

  /** El vendor de una unidad: el de cualquiera de sus filas, también las liberadas (una expense sin WO sigue siendo suya). */
  async vendorOfUnit(idDetailer: number, unit: PieceworkUnitKey): Promise<number | null> {
    const rows: { idEmployee: unknown }[] = await this.repo.query(
      `SELECT pw.id_employee AS idEmployee
         FROM EXP_EXPENSE_PIECEWORK_WO pw
         JOIN EXP_EXPENSE e ON e.id = pw.id_expense AND e.id_detailer = ?
        WHERE ${'idExpGroup' in unit ? 'e.id_exp_group = ?' : 'e.id = ?'}
        ORDER BY pw.id LIMIT 1`,
      [idDetailer, 'idExpGroup' in unit ? unit.idExpGroup : unit.idExpense],
    )
    return rows.length ? Number(rows[0].idEmployee) : null
  }

  /**
   * Cambia una fila (monto, dealer, fecha, fila de EXP_EXPENSE, insumos) y deja `checked_at` con la hora de la base
   * (`NOW()`, la misma que LOG_GENERIC y el histórico).
   */
  async updateRow(id: number, patch: QueryDeepPartialEntity<ExpensePieceworkWo>): Promise<void> {
    await this.repo.update({ id }, { ...patch, checkedAt: () => 'NOW()' })
  }

  /** La WO sale de la expense y queda libre (D18 y D20): la fila queda como histórico. */
  async release(id: number): Promise<void> {
    await this.repo.softDelete({ id })
  }

  /** Las filas de esas expenses de la empresa (cualquier estado de la expense). */
  async rowsOfExpenses(idDetailer: number, expenseIds: readonly number[]): Promise<ExpensePieceworkWo[]> {
    if (!expenseIds.length) return []
    return this.repo
      .createQueryBuilder('pw')
      .innerJoin('EXP_EXPENSE', 'e', 'e.id = pw.id_expense AND e.id_detailer = :det', { det: idDetailer })
      .where('pw.idExpense IN (:...ids)', { ids: [...expenseIds] })
      .orderBy('pw.id', 'ASC')
      .getMany()
  }
}
