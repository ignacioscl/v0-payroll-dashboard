import { Inject, Injectable } from '@nestjs/common'

import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { ExpenseQueryDto } from '../dto/expense.dto'
import { Expense } from '../entity/expense.entity'
import { ExpenseRepository } from '../repository/expense.repository'

/** CRUD de EXP_EXPENSE. La lógica de alta/edición/estado está en ExpenseFacadeService. */
@Injectable()
export class ExpenseService extends GlobalBaseService<Expense, ExpenseQueryDto> {
  constructor(@Inject(ExpenseRepository) private readonly repository: ExpenseRepository) {
    super()
  }

  protected getRepository(): ExpenseRepository {
    return this.repository
  }

  findOwned(id: number, idDetailer: number) {
    return this.repository.findOwned(id, idDetailer)
  }

  findByGroup(idExpGroup: number, idDetailer: number, estado?: number) {
    return this.repository.findByGroup(idExpGroup, idDetailer, estado)
  }

  findOwnedByIds(ids: number[], idDetailer: number) {
    return this.repository.findOwnedByIds(ids, idDetailer)
  }
}
