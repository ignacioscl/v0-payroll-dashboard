import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { SRS_CONNECTION } from '../srs.datasource'
import { SrsAuthModule } from '../auth/srs-auth.module'
import { InvoiceStatement } from './entity/invoice-statement.srsentity'
import { InvoiceStatementInvRel } from './entity/invoice-statement-inv-rel.srsentity'

import { BillingKpiController } from './controller/billing-kpi.controller'
import { BillingKpiService } from './service/billing-kpi.service'
import { BillingKpiRepository } from './repository/billing-kpi.repository'

@Module({
  imports: [SrsAuthModule, TypeOrmModule.forFeature([InvoiceStatement, InvoiceStatementInvRel], SRS_CONNECTION)],
  providers: [BillingKpiRepository, BillingKpiService],
  controllers: [BillingKpiController],
  exports: [BillingKpiService],
})
export class SrsBillingModule {}
