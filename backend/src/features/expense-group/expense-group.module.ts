import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { ExpenseGroup } from './entity/expense-group.entity'
import { ExpenseGroupRepository } from './repository/expense-group.repository'
import { ExpenseGroupService } from './service/expense-group.service'

/** EXP_EXPENSE_GROUP (tabla nueva, migration 020). Sin HTTP propio: lo orquesta ExpenseFacadeService. */
@Module({
  imports: [TypeOrmModule.forFeature([ExpenseGroup])],
  providers: [ExpenseGroupRepository, ExpenseGroupService],
  exports: [ExpenseGroupService],
})
export class ExpenseGroupModule {}
