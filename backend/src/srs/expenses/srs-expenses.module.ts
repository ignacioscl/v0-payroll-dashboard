import { Module } from '@nestjs/common'

import { SrsContratistaModule } from 'src/features/srs-contratista/srs-contratista.module'
import { SrsAuthModule } from '../auth/srs-auth.module'
import { ExpenseReportController } from './controller/expense-report.controller'
import { ExpenseReportRepository } from './repository/expense-report.repository'
import { ExpenseReportService } from './service/expense-report.service'

/**
 * Reporte de Expenses en Pro (plans/plan-expenses-pro T2.5 = plans/plan-monthly-closing T3): el dueño de lectura
 * de EXP_EXPENSE (lista, tarjetas, export, Analytics, empleados). Exporta el repositorio para los facades de
 * srs-expense y para el Monthly Closing.
 */
@Module({
  imports: [SrsAuthModule, SrsContratistaModule],
  controllers: [ExpenseReportController],
  providers: [ExpenseReportRepository, ExpenseReportService],
  exports: [ExpenseReportRepository],
})
export class SrsExpensesModule {}
