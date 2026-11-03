import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { ExpenseDealerAssign } from './entity/expense-dealer-assign.entity'
import { ExpenseDealerAssignRepository } from './repository/expense-dealer-assign.repository'
import { ExpenseDealerAssignService } from './service/expense-dealer-assign.service'

/** EXP_EXPENSE_DEALER_ASSIGN (legacy). Sin HTTP propio: los endpoints van por la regla (srs-expense-repetitive). */
@Module({
  imports: [TypeOrmModule.forFeature([ExpenseDealerAssign])],
  providers: [ExpenseDealerAssignRepository, ExpenseDealerAssignService],
  exports: [ExpenseDealerAssignService],
})
export class SrsExpenseDealerAssignModule {}
