import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { SRS_CONNECTION } from '../srs.datasource'
import { SrsAuthModule } from '../auth/srs-auth.module'
import { TtkEmployeeWork } from '../payroll/entity/ttk-employee-work.srsentity'

import { PunchKpiController } from './controller/punch-kpi.controller'
import { PunchKpiService } from './service/punch-kpi.service'
import { PunchKpiRepository } from './repository/punch-kpi.repository'

@Module({
  imports: [SrsAuthModule, TypeOrmModule.forFeature([TtkEmployeeWork], SRS_CONNECTION)],
  providers: [PunchKpiRepository, PunchKpiService],
  controllers: [PunchKpiController],
  exports: [PunchKpiService],
})
export class SrsPunchModule {}
