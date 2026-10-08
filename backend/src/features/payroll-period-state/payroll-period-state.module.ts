import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { JOBS_CONNECTION } from '../../jobs/jobs.datasource'
import { PayrollPeriodState } from './entity/payroll-period-state.jobsentity'
import { PayrollPeriodStateRepository } from './repository/payroll-period-state.repository'
import { PayrollPeriodStateService } from './service/payroll-period-state.service'

/** `srssui5_srs_jobs.PAYROLL_PERIOD_STATE`. */
@Module({
  imports: [TypeOrmModule.forFeature([PayrollPeriodState], JOBS_CONNECTION)],
  providers: [PayrollPeriodStateRepository, PayrollPeriodStateService],
  exports: [PayrollPeriodStateService],
})
export class PayrollPeriodStateModule {}
