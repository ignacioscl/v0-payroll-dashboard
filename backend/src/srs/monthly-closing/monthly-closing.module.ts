import { Module, forwardRef } from '@nestjs/common'

import { SrsUsuarioModule } from 'src/features/srs-usuario/srs-usuario.module'
import { SrsContratistaModule } from 'src/features/srs-contratista/srs-contratista.module'
import { SrsAuthModule } from '../auth/srs-auth.module'
import { SrsBillingModule } from '../billing/srs-billing.module'
import { SrsExpensesModule } from '../expenses/srs-expenses.module'
import { SrsPayrollModule } from '../payroll/srs-payroll.module'
import { SrsExportModule } from '../shared/export/srs-export.module'

import { MonthlyClosingController } from './controller/monthly-closing.controller'
import { MonthlyClosingService } from './service/monthly-closing.service'

/**
 * Monthly Closing y Window Tint Closing (plans/plan-monthly-closing, plans/plan-reporte-tint). Solo lecturas:
 * Income lo da billing, Payroll el snapshot, Expenses su repositorio y los tinteros srs-usuario.
 */
@Module({
  // forwardRef: srs-usuario → srs-rol → rol-template → srs-usuario se cargan en ciclo (como en srs-rol.module.ts).
  imports: [
    SrsAuthModule,
    SrsBillingModule,
    SrsPayrollModule,
    SrsExpensesModule,
    forwardRef(() => SrsUsuarioModule),
    SrsExportModule,
    // Window Tint Closing: check de la empresa (ContratistaService.assertCompanyModule).
    SrsContratistaModule,
  ],
  providers: [MonthlyClosingService],
  controllers: [MonthlyClosingController],
})
export class SrsMonthlyClosingModule {}
