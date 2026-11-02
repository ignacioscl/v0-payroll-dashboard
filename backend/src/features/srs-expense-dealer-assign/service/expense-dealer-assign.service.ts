import { Inject, Injectable } from '@nestjs/common'

import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { ExpenseDealerAssignQueryDto } from '../dto/expense-dealer-assign.dto'
import { ExpenseDealerAssign } from '../entity/expense-dealer-assign.entity'
import { ExpenseDealerAssignRepository } from '../repository/expense-dealer-assign.repository'

/** CRUD de EXP_EXPENSE_DEALER_ASSIGN. El reparto (changeAssigns y cía.) está en RecurringExpenseFacadeService. */
@Injectable()
export class ExpenseDealerAssignService extends GlobalBaseService<ExpenseDealerAssign, ExpenseDealerAssignQueryDto> {
  constructor(@Inject(ExpenseDealerAssignRepository) private readonly repository: ExpenseDealerAssignRepository) {
    super()
  }

  protected getRepository(): ExpenseDealerAssignRepository {
    return this.repository
  }

  listForRule(idExpRepetitive: number) {
    return this.repository.listForRule(idExpRepetitive)
  }

  listForRuleWithNames(idExpRepetitive: number, idDealerProvider: number) {
    return this.repository.listForRuleWithNames(idExpRepetitive, idDealerProvider)
  }

  findWithRule(id: number) {
    return this.repository.findWithRule(id)
  }

  dealerIdsInRule(idExpRepetitive: number) {
    return this.repository.dealerIdsInRule(idExpRepetitive)
  }

  /** `updateDealerAssign` legacy: percentage, fixed_amount y has_automatic_percentaje. */
  async updateAssign(
    id: number,
    patch: { percentage?: string | null; fixedAmount?: string | null; hasAutomaticPercentaje?: number },
  ): Promise<void> {
    await this.repository.update(id, patch)
  }

  /** `removeDealerAssign` legacy: borra la fila (no hay estado). */
  async remove(id: number): Promise<void> {
    await this.repository.delete(id)
  }
}
