import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { SrsAuthModule } from 'src/srs/auth/srs-auth.module'
import { SrsExpensesModule } from 'src/srs/expenses/srs-expenses.module'
import { ExpenseGroupModule } from '../expense-group/expense-group.module'
import { SrsContratistaModule } from '../srs-contratista/srs-contratista.module'
import { SrsExpenseDealerAssignModule } from '../srs-expense-dealer-assign/srs-expense-dealer-assign.module'
import { SrsExpenseRepetitiveModule } from '../srs-expense-repetitive/srs-expense-repetitive.module'
import { SrsGenericDataModule } from '../srs-generic-data/srs-generic-data.module'
import { SrsLogChangeModule } from '../srs-log-change/srs-log-change.module'
import { SrsLogGenericModule } from '../srs-log-generic/srs-log-generic.module'
import { ExpenseCatalogAdminController } from './controller/expense-catalog-admin.controller'
import { ExpenseController } from './controller/expense.controller'
import { RecurringPastPeriodsController } from './controller/recurring-past-periods.controller'
import { SrsPayrollModule } from 'src/srs/payroll/srs-payroll.module'
import { SrsUsuarioModule } from '../srs-usuario/srs-usuario.module'
import { Expense } from './entity/expense.entity'
import { ExpensePieceworkWo } from './entity/expense-piecework-wo.entity'
import { ExpensePieceworkWoHistory } from './entity/expense-piecework-wo-history.entity'
import { ExpensePieceworkWoHistoryRepository } from './repository/expense-piecework-wo-history.repository'
import { ExpensePieceworkWoRepository } from './repository/expense-piecework-wo.repository'
import { ExpenseRepository } from './repository/expense.repository'
import { ExpensePieceworkService } from './service/expense-piecework.service'
import { ExpensePieceworkRecalcService } from './service/expense-piecework-recalc.service'
import { ExpenseCatalogAdminService } from './service/expense-catalog-admin.service'
import { ExpenseFacadeService } from './service/expense-facade.service'
import { ExpenseService } from './service/expense.service'
import { RecurringPastPeriodsService } from './service/recurring-past-periods.service'

/**
 * EXP_EXPENSE (legacy): CRUD + el facade de alta/edición/estado + borrar y unificar el catálogo de Settings.
 * Orquesta services de los otros features.
 */
@Module({
  imports: [
    SrsAuthModule,
    SrsExpensesModule,
    ExpenseGroupModule,
    SrsGenericDataModule,
    SrsLogGenericModule,
    SrsLogChangeModule,
    SrsExpenseRepetitiveModule,
    SrsExpenseDealerAssignModule,
    SrsContratistaModule,
    // Expense Piecework (plans/plan-reunion-juan-18-11 tema 4): el piecework por WO y los pay periods (snapshot) y
    // los vendors (srs-usuario).
    SrsPayrollModule,
    SrsUsuarioModule,
    TypeOrmModule.forFeature([Expense, ExpensePieceworkWo, ExpensePieceworkWoHistory]),
  ],
  controllers: [ExpenseController, ExpenseCatalogAdminController, RecurringPastPeriodsController],
  providers: [
    ExpenseRepository,
    ExpenseService,
    ExpenseFacadeService,
    ExpenseCatalogAdminService,
    RecurringPastPeriodsService,
    ExpensePieceworkWoRepository,
    ExpensePieceworkService,
    ExpensePieceworkWoHistoryRepository,
    ExpensePieceworkRecalcService,
  ],
  // ExpensePieceworkRecalcService: lo usa el job del snapshot de Payroll (T5b).
  exports: [ExpenseService, ExpenseFacadeService, ExpensePieceworkRecalcService],
})
export class SrsExpenseModule {}
