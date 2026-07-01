import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { SRS_CONNECTION } from '../srs.datasource'
import { SrsAuthModule } from '../auth/srs-auth.module'
import { Invoice } from './entity/invoice.srsentity'
import { InvoiceServiceRel } from './entity/invoice-service-rel.srsentity'
import { LogWoWorkflowChange } from './entity/log-wo-workflow-change.srsentity'
import { Workflow } from './entity/workflow.srsentity'

import { ProductionKpiController } from './controller/production-kpi.controller'
import { ProductionKpiService } from './service/production-kpi.service'
import { ProductionKpiRepository } from './repository/production-kpi.repository'

/**
 * Vertical de KPIs de producción (SRS legacy). Entidades registradas en la
 * conexión nombrada 'srs'. El repo usa el DataSource 'srs' (queries crudas).
 */
@Module({
  imports: [
    SrsAuthModule,
    TypeOrmModule.forFeature([Invoice, InvoiceServiceRel, LogWoWorkflowChange, Workflow], SRS_CONNECTION),
  ],
  providers: [ProductionKpiRepository, ProductionKpiService],
  controllers: [ProductionKpiController],
  exports: [ProductionKpiService],
})
export class SrsProductionModule {}
