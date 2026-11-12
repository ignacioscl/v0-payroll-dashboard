import { Inject, Injectable } from '@nestjs/common'

import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { ExpenseRepetitiveQueryDto } from '../dto/expense-repetitive.dto'
import { ExpenseRepetitive } from '../entity/expense-repetitive.entity'
import { ExpenseRepetitiveRepository } from '../repository/expense-repetitive.repository'

/** CRUD de EXP_EXPENSE_REPETITIVE. El port de ExpenseRepetitiveHelper.php está en RecurringExpenseFacadeService. */
@Injectable()
export class ExpenseRepetitiveService extends GlobalBaseService<ExpenseRepetitive, ExpenseRepetitiveQueryDto> {
  constructor(@Inject(ExpenseRepetitiveRepository) private readonly repository: ExpenseRepetitiveRepository) {
    super()
  }

  protected getRepository(): ExpenseRepetitiveRepository {
    return this.repository
  }

  findOwned(id: number, idDealerProvider: number) {
    return this.repository.findOwned(id, idDealerProvider)
  }

  listActive(input: Parameters<ExpenseRepetitiveRepository['listActive']>[0]) {
    return this.repository.listActive(input)
  }

  listAllActive(idDealerProvider: number) {
    return this.repository.listAllActive(idDealerProvider)
  }

  findByCatalog(field: 'idCompany' | 'idCategory', idCatalog: number, idDealerProvider: number) {
    return this.repository.findByCatalog(field, idCatalog, idDealerProvider)
  }

  reassignCatalog(field: 'idCompany' | 'idCategory', fromId: number, toId: number, idDealerProvider: number) {
    return this.repository.reassignCatalog(field, fromId, toId, idDealerProvider)
  }

  /** `updateAmount` legacy. */
  async updateAmount(id: number, amount: string | null): Promise<void> {
    await this.repository.update(id, { amount })
  }

  /** `updateSplitType` legacy. */
  async updateSplitType(id: number, splitType: number): Promise<void> {
    await this.repository.update(id, { splitType })
  }
}
