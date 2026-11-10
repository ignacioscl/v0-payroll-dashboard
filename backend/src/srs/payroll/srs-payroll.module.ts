import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { SRS_CONNECTION } from '../srs.datasource'
import { SrsAuthModule } from '../auth/srs-auth.module'
import { TtkEmployeeWork } from './entity/ttk-employee-work.srsentity'

import { PayrollKpiController } from './controller/payroll-kpi.controller'
import { PayrollKpiService } from './service/payroll-kpi.service'
import { PayrollKpiRepository } from './repository/payroll-kpi.repository'
import { PayrollSnapshotKpiRepository } from './repository/payroll-snapshot-kpi.repository'
import { PayrollSourceRepository } from './snapshot/payroll-source.repository'

@Module({
  imports: [SrsAuthModule, TypeOrmModule.forFeature([TtkEmployeeWork], SRS_CONNECTION)],
  // PayrollSourceRepository: solo lecturas (los períodos de TTK_DATE_GROUP_REPORT) para Monthly Closing.
  providers: [PayrollKpiRepository, PayrollSnapshotKpiRepository, PayrollSourceRepository, PayrollKpiService],
  controllers: [PayrollKpiController],
  exports: [PayrollKpiService, PayrollSnapshotKpiRepository, PayrollSourceRepository],
})
export class SrsPayrollModule {}
