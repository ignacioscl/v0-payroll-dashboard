import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'

import { dataSourceOptions } from './typeorm.config'

import { DataSource } from 'typeorm'
import { addTransactionalDataSource } from 'typeorm-transactional'

import configuration from './configuration'

import { APP_INTERCEPTOR } from '@nestjs/core'
import { TrimResponseInterceptor } from './commons/interceptor/trim.interceptor'
import { LoggerSystemModule } from './commons/logs/logger.system.module'

// --- SRS Suite ---
import { srsDataSourceOptions, SRS_CONNECTION } from './srs/srs.datasource'
import { SrsPoolAcquireTimeout } from './srs/srs-pool-acquire-timeout'
import { HealthModule } from './features/health/health.module'
import { SrsProductionModule } from './srs/production/srs-production.module'
import { SrsBillingModule } from './srs/billing/srs-billing.module'
import { SrsCollectionsModule } from './srs/collections/srs-collections.module'
import { SrsPunchModule } from './srs/punch/srs-punch.module'
import { SrsPayrollModule } from './srs/payroll/srs-payroll.module'
import { RolTemplateModule } from './features/rol-template/rol-template.module'
import { SrsContratistaModule } from './features/srs-contratista/srs-contratista.module'
// --- Expenses en Pro (plans/plan-expenses-pro): reporte + 7 features, uno por tabla ---
import { SrsExpensesModule } from './srs/expenses/srs-expenses.module'
import { SrsGenericDataModule } from './features/srs-generic-data/srs-generic-data.module'
import { SrsExpenseModule } from './features/srs-expense/srs-expense.module'
import { ExpenseGroupModule } from './features/expense-group/expense-group.module'
import { SrsExpenseRepetitiveModule } from './features/srs-expense-repetitive/srs-expense-repetitive.module'
import { SrsExpenseDealerAssignModule } from './features/srs-expense-dealer-assign/srs-expense-dealer-assign.module'
import { SrsLogGenericModule } from './features/srs-log-generic/srs-log-generic.module'
import { SrsLogChangeModule } from './features/srs-log-change/srs-log-change.module'
import { SrsInvoiceModule } from './features/srs-invoice/srs-invoice.module'
import { SrsInvoiceStatementModule } from './features/srs-invoice-statement/srs-invoice-statement.module'
// --- Monthly Closing y Window Tint Closing (plans/plan-monthly-closing, plans/plan-reporte-tint) ---
import { SrsMonthlyClosingModule } from './srs/monthly-closing/monthly-closing.module'
// --- Jobs (worker) ---
import { jobsDataSourceOptions, JOBS_CONNECTION } from './jobs/jobs.datasource'
import { JobsModule } from './jobs/jobs.module'
import { validateEnv } from './config/env.validation'
//ImportTemplateModule
//NO BORRAR LA LINEA DE ARRIBA

@Module({
  imports: [
    LoggerSystemModule,
    // Sin una variable obligatoria el Nest no arranca y el log dice cuál (config/env.validation.ts).
    ConfigModule.forRoot({ load: [configuration], isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      useFactory() {
        return dataSourceOptions
      },
      async dataSourceFactory(options) {
        if (!options) {
          throw new Error('Invalid options passed')
        }

        return addTransactionalDataSource(new DataSource(dataSourceOptions))
      },
    }),
    // Conexión nombrada a la base LEGACY de SRS (solo lectura, synchronize:false).
    TypeOrmModule.forRootAsync({
      name: SRS_CONNECTION,
      useFactory() {
        return srsDataSourceOptions
      },
    }),
    // Conexión nombrada a la base de los jobs (srssui5_srs_jobs): corridas, log y estado.
    TypeOrmModule.forRootAsync({
      name: JOBS_CONNECTION,
      useFactory() {
        return jobsDataSourceOptions
      },
    }),
    HealthModule,
    SrsProductionModule,
    SrsBillingModule,
    SrsCollectionsModule,
    SrsPunchModule,
    SrsPayrollModule,
    RolTemplateModule,
    SrsContratistaModule,
    SrsExpensesModule,
    SrsMonthlyClosingModule,
    SrsGenericDataModule,
    SrsExpenseModule,
    ExpenseGroupModule,
    SrsExpenseRepetitiveModule,
    SrsExpenseDealerAssignModule,
    SrsLogGenericModule,
    SrsLogChangeModule,
    // WO to be Billed (plans/plan-wo-to-be-billed-v0): eliminar WO / RO# PO# y generar invoices.
    SrsInvoiceModule,
    SrsInvoiceStatementModule,
    JobsModule,
    //TemplateModule
    //NO BORRAR LA LINEA DE ARRIBA
  ],
  controllers: [],
  providers: [
    // Límite de espera de conexión del pool 'srs' (plans/plan-pool-v0-saturacion).
    SrsPoolAcquireTimeout,
    {
      provide: APP_INTERCEPTOR,
      useClass: TrimResponseInterceptor,
    },
  ],
})
export class AppModule {}
