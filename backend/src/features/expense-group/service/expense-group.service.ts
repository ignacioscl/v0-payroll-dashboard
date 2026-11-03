import { Inject, Injectable } from '@nestjs/common'

import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { ExpenseGroupQueryDto } from '../dto/expense-group.dto'
import { ExpenseGroup } from '../entity/expense-group.entity'
import { ExpenseGroupRepository } from '../repository/expense-group.repository'

/** CRUD de EXP_EXPENSE_GROUP. La lógica de alta/edición está en ExpenseFacadeService. */
@Injectable()
export class ExpenseGroupService extends GlobalBaseService<ExpenseGroup, ExpenseGroupQueryDto> {
  constructor(@Inject(ExpenseGroupRepository) private readonly repository: ExpenseGroupRepository) {
    super()
  }

  protected getRepository(): ExpenseGroupRepository {
    return this.repository
  }

  findOwned(id: number, idDetailer: number) {
    return this.repository.findOwned(id, idDetailer)
  }

  /** Marca o limpia `deleted_at` (el grupo no tiene `estado`: su baja es no tener filas activas). */
  async setDeleted(id: number, deleted: boolean): Promise<void> {
    await this.repository.update(id, { deletedAt: deleted ? new Date() : (null as unknown as Date) })
  }

  async setAttachmentExpense(id: number, idExpense: number | null): Promise<void> {
    await this.repository.update(id, { idAttachmentExpense: idExpense })
  }

  async setSplitType(id: number, splitType: number): Promise<void> {
    await this.repository.update(id, { splitType })
  }
}
