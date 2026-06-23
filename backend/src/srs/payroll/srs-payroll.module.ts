import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { SRS_CONNECTION } from '../srs.datasource'
import { SrsAuthModule } from '../auth/srs-auth.module'
import { TtkEmployeeWork } from './entity/ttk-employee-work.srsentity'

import { PayrollKpiController } from './controller/payroll-kpi.controller'
import { PayrollKpiService } from './service/payroll-kpi.service'
import { PayrollKpiRepository } from './repository/payroll-kpi.repository'

@Module({
  imports: [SrsAuthModule, TypeOrmModule.forFeature([TtkEmployeeWork], SRS_CONNECTION)],
  providers: [PayrollKpiRepository, PayrollKpiService],
  controllers: [PayrollKpiController],
  exports: [PayrollKpiService],
})
export class SrsPayrollModule {}
