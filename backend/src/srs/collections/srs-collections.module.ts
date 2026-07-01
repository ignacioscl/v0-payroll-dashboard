import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { SRS_CONNECTION } from '../srs.datasource'
import { SrsAuthModule } from '../auth/srs-auth.module'
import { Billing } from './entity/billing.srsentity'
import { BillingWoRel } from './entity/billing-wo-rel.srsentity'

import { CollectionsKpiController } from './controller/collections-kpi.controller'
import { CollectionsKpiService } from './service/collections-kpi.service'
import { CollectionsKpiRepository } from './repository/collections-kpi.repository'

@Module({
  imports: [SrsAuthModule, TypeOrmModule.forFeature([Billing, BillingWoRel], SRS_CONNECTION)],
  providers: [CollectionsKpiRepository, CollectionsKpiService],
  controllers: [CollectionsKpiController],
  exports: [CollectionsKpiService],
})
export class SrsCollectionsModule {}
