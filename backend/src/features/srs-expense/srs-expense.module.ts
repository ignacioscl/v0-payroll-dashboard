import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { SrsAuthModule } from 'src/srs/auth/srs-auth.module'
import { SrsExpensesModule } from 'src/srs/expenses/srs-expenses.module'
import { ExpenseGroupModule } from '../expense-group/expense-group.module'
import { SrsContratistaModule } from '../srs-contratista/srs-contratista.module'
import { SrsExpenseRepetitiveModule } from '../srs-expense-repetitive/srs-expense-repetitive.module'
import { SrsGenericDataModule } from '../srs-generic-data/srs-generic-data.module'
import { SrsLogGenericModule } from '../srs-log-generic/srs-log-generic.module'
import { ExpenseController } from './controller/expense.controller'
import { Expense } from './entity/expense.entity'
import { ExpenseRepository } from './repository/expense.repository'
import { ExpenseFacadeService } from './service/expense-facade.service'
import { ExpenseService } from './service/expense.service'

/** EXP_EXPENSE (legacy): CRUD + el facade de alta/edición/estado. Orquesta services de los otros features. */
@Module({
  imports: [
    SrsAuthModule,
    SrsExpensesModule,
    ExpenseGroupModule,
    SrsGenericDataModule,
    SrsLogGenericModule,
    SrsExpenseRepetitiveModule,
    SrsContratistaModule,
    TypeOrmModule.forFeature([Expense]),
  ],
  controllers: [ExpenseController],
  providers: [ExpenseRepository, ExpenseService, ExpenseFacadeService],
  exports: [ExpenseService, ExpenseFacadeService],
})
export class SrsExpenseModule {}
