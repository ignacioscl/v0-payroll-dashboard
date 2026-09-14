import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { SRS_CONNECTION } from '../srs.datasource'
import { SrsAuthModule } from '../auth/srs-auth.module'
import { TtkEmployeeWork } from '../payroll/entity/ttk-employee-work.srsentity'

import { PunchKpiController } from './controller/punch-kpi.controller'
import { PunchKpiService } from './service/punch-kpi.service'
import { PunchKpiRepository } from './repository/punch-kpi.repository'
import { GroupedPunchController } from './controller/punch-grouped.controller'
import { GroupedPunchService } from './service/punch-grouped.service'
import { GroupedPunchRepository } from './repository/punch-grouped.repository'
import { PunchListController } from './controller/punch-list.controller'
import { PunchListService } from './service/punch-list.service'
import { PunchListRepository } from './repository/punch-list.repository'
import { PunchAccessPolicyService } from './punch-access-policy'
import { PunchExportService } from './service/punch-export.service'
import { PunchExportTicketStore } from './punch-export-ticket.store'
import { PunchExportSemaphore } from './punch-export-semaphore'
import { PunchDealerRankingController } from './controller/punch-dealer-ranking.controller'
import { PunchDealerRankingService } from './service/punch-dealer-ranking.service'
import { PunchDealerRankingExportService } from './service/punch-dealer-ranking-export.service'
import { PunchDealerRankingRepository } from './repository/punch-dealer-ranking.repository'

@Module({
  imports: [SrsAuthModule, TypeOrmModule.forFeature([TtkEmployeeWork], SRS_CONNECTION)],
  providers: [
    PunchKpiRepository,
    PunchKpiService,
    GroupedPunchRepository,
    GroupedPunchService,
    PunchListRepository,
    PunchListService,
    PunchAccessPolicyService,
    // Ticket store y semáforo son UNO para los dos exports (Punch Report y ranking).
    PunchExportTicketStore,
    PunchExportSemaphore,
    PunchExportService,
    PunchDealerRankingRepository,
    PunchDealerRankingService,
    PunchDealerRankingExportService,
  ],
  controllers: [
    PunchKpiController,
    GroupedPunchController,
    PunchListController,
    PunchDealerRankingController,
  ],
  exports: [PunchKpiService, GroupedPunchService, PunchListService],
})
export class SrsPunchModule {}
