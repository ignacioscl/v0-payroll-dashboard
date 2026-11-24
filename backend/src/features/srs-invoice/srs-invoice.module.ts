import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { SrsAuthModule } from 'src/srs/auth/srs-auth.module'
import { SrsBillingModule } from 'src/srs/billing/srs-billing.module'
import { SrsLogChangeModule } from '../srs-log-change/srs-log-change.module'
import { WorkOrderController } from './controller/work-order.controller'
import { WorkOrder } from './entity/work-order.entity'
import { WorkOrderRulesRepository } from './repository/work-order-rules.repository'
import { WorkOrderRepository } from './repository/work-order.repository'
import { WorkOrderFacadeService } from './service/work-order-facade.service'
import { WorkOrderService } from './service/work-order.service'

/**
 * `INVOICE` (la WO) en Pro: eliminar y RO# / PO# desde WO to be Billed (plans/plan-wo-to-be-billed-v0, T5 y T6), y la
 * lectura de la WO que usa la invoice individual (`srs-invoice-statement`). Sin `forwardRef`: nadie de los que importa
 * lo importa de vuelta.
 */
@Module({
  imports: [SrsAuthModule, SrsBillingModule, SrsLogChangeModule, TypeOrmModule.forFeature([WorkOrder])],
  controllers: [WorkOrderController],
  providers: [WorkOrderRepository, WorkOrderService, WorkOrderRulesRepository, WorkOrderFacadeService],
  exports: [WorkOrderService, WorkOrderRulesRepository],
})
export class SrsInvoiceModule {}
