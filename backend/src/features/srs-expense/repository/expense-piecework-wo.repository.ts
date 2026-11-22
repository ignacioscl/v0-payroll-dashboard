import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { ExpensePieceworkWo } from '../entity/expense-piecework-wo.entity'

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
