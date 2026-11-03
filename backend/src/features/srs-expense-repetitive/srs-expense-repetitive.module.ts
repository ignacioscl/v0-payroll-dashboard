import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { SrsAuthModule } from 'src/srs/auth/srs-auth.module'
import { SrsExpensesModule } from 'src/srs/expenses/srs-expenses.module'
import { SrsContratistaModule } from '../srs-contratista/srs-contratista.module'
import { SrsExpenseDealerAssignModule } from '../srs-expense-dealer-assign/srs-expense-dealer-assign.module'
import { SrsGenericDataModule } from '../srs-generic-data/srs-generic-data.module'
import { SrsLogChangeModule } from '../srs-log-change/srs-log-change.module'
import { RecurringExpenseController } from './controller/recurring-expense.controller'
import { ExpenseRepetitive } from './entity/expense-repetitive.entity'
import { ExpenseRepetitiveRepository } from './repository/expense-repetitive.repository'
import { ExpenseRepetitiveService } from './service/expense-repetitive.service'
import { RecurringExpenseFacadeService } from './service/recurring-expense-facade.service'

/** EXP_EXPENSE_REPETITIVE (legacy): CRUD + el port de ExpenseRepetitiveHelper.php. */
@Module({
  imports: [
    SrsAuthModule,
    SrsExpensesModule,
    SrsExpenseDealerAssignModule,
    SrsLogChangeModule,
    SrsGenericDataModule,
    SrsContratistaModule,
    TypeOrmModule.forFeature([ExpenseRepetitive]),
  ],
  controllers: [RecurringExpenseController],
  providers: [ExpenseRepetitiveRepository, ExpenseRepetitiveService, RecurringExpenseFacadeService],
  exports: [ExpenseRepetitiveService, RecurringExpenseFacadeService],
})
export class SrsExpenseRepetitiveModule {}
