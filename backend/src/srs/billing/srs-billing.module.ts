import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { SRS_CONNECTION } from '../srs.datasource'
import { SrsAuthModule } from '../auth/srs-auth.module'
import { SrsExportModule } from '../shared/export/srs-export.module'
import { SrsPayrollModule } from '../payroll/srs-payroll.module'
import { OpenInvoiceSnapshotModule } from '../../features/open-invoice-snapshot/open-invoice-snapshot.module'
import { SrsContratistaModule } from '../../features/srs-contratista/srs-contratista.module'
import { InvoiceStatement } from './entity/invoice-statement.srsentity'
import { InvoiceStatementInvRel } from './entity/invoice-statement-inv-rel.srsentity'

import { BillingKpiController } from './controller/billing-kpi.controller'
import { BillingKpiService } from './service/billing-kpi.service'
import { BillingKpiRepository } from './repository/billing-kpi.repository'
import { InvoiceController } from './controller/invoice.controller'
import { InvoiceService } from './service/invoice.service'
import { InvoiceRepository } from './repository/invoice.repository'
import { GenericInvoiceController } from './controller/generic-invoice.controller'
import { GenericInvoiceService } from './service/generic-invoice.service'
import { GenericInvoiceRepository } from './repository/generic-invoice.repository'
import { InvoiceExportController } from './controller/invoice-export.controller'
import { InvoiceExportService } from './service/invoice-export.service'
import { InvoiceListExportController } from './controller/invoice-list-export.controller'
import { InvoiceListExportService } from './service/invoice-list-export.service'
import { OpenInvoicesRepository } from './repository/open-invoices.repository'
import { OpenInvoicesCompareRepository } from './repository/open-invoices-compare.repository'
import { OpenInvoicesService } from './service/open-invoices.service'
import { OpenInvoicesCompareService } from './service/open-invoices-compare.service'
import { WoToBeBilledController } from './controller/wo-to-be-billed.controller'
import { WoToBeBilledRepository } from './repository/wo-to-be-billed.repository'
import { WoToBeBilledService } from './service/wo-to-be-billed.service'

@Module({
  imports: [
    SrsAuthModule,
    SrsExportModule,
    // Open Invoices: «All» in Report Info (activeDealerIds) and the snapshot (plans/plan-reporte-javier T6).
    SrsPayrollModule,
    OpenInvoiceSnapshotModule,
    // Open Invoices: the company's «Closing reports» module (D17 of plans/plan-reunion-juan-18-11).
    SrsContratistaModule,
    TypeOrmModule.forFeature([InvoiceStatement, InvoiceStatementInvRel], SRS_CONNECTION),
  ],
  providers: [
    BillingKpiRepository,
    BillingKpiService,
    InvoiceRepository,
    InvoiceService,
    GenericInvoiceRepository,
    GenericInvoiceService,
    InvoiceExportService,
    InvoiceListExportService,
    OpenInvoicesRepository,
    OpenInvoicesCompareRepository,
    OpenInvoicesService,
    OpenInvoicesCompareService,
    // WO to be Billed (plans/plan-wo-to-be-billed-v0, T4): la lectura; las escrituras van en features/srs-invoice*.
    WoToBeBilledRepository,
    WoToBeBilledService,
  ],
  // The export controllers go before InvoiceController so `/invoices/export` and
  // `/invoices/list-export` are never read as `/invoices/:id/...`.
  controllers: [
    BillingKpiController,
    InvoiceExportController,
    InvoiceListExportController,
    InvoiceController,
    GenericInvoiceController,
    WoToBeBilledController,
  ],
  // BillingKpiRepository: Income por dealer y por línea para Monthly Closing (T1 de plans/plan-monthly-closing).
  // WoToBeBilledService / Repository: la generación (features/srs-invoice-statement) valida el filtro y lee las líneas
  // pendientes dentro de su transacción. Ninguno de los dos importa al feature: no hay ciclo.
  exports: [BillingKpiService, InvoiceService, BillingKpiRepository, WoToBeBilledService, WoToBeBilledRepository],
})
export class SrsBillingModule {}
