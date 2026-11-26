import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { SrsAuthModule } from 'src/srs/auth/srs-auth.module'
import { SrsBillingModule } from 'src/srs/billing/srs-billing.module'
import { SrsInvoiceModule } from '../srs-invoice/srs-invoice.module'
import { SrsLogChangeModule } from '../srs-log-change/srs-log-change.module'
import { WoInvoiceController } from './controller/wo-invoice.controller'
import { InvoiceStatementInvRel } from './entity/invoice-statement-inv-rel.entity'
import { InvoiceStatementSelSerRel } from './entity/invoice-statement-sel-ser-rel.entity'
import { InvoiceStatement } from './entity/invoice-statement.entity'
import { InvoiceStatementInvRelRepository } from './repository/invoice-statement-inv-rel.repository'
import { InvoiceStatementSelSerRelRepository } from './repository/invoice-statement-sel-ser-rel.repository'
import { InvoiceStatementRepository } from './repository/invoice-statement.repository'
import { InvoiceStatementInvRelService } from './service/invoice-statement-inv-rel.service'
import { InvoiceStatementSelSerRelService } from './service/invoice-statement-sel-ser-rel.service'
import { InvoiceStatementService } from './service/invoice-statement.service'
import { WoInvoiceFacadeService } from './service/wo-invoice-facade.service'

/**
 * `INVOICE_STATEMENT` (la invoice) y sus dos `*_REL`, conexión principal: generar invoices desde WO to be Billed
 * (plans/plan-wo-to-be-billed-v0, T3). Importa la lectura de billing (`WoToBeBilledRepository`), la WO
 * (`srs-invoice`) y el Log; nadie lo importa de vuelta (sin `forwardRef`).
 */
@Module({
  imports: [
    SrsAuthModule,
    SrsBillingModule,
    SrsInvoiceModule,
    SrsLogChangeModule,
    TypeOrmModule.forFeature([InvoiceStatement, InvoiceStatementInvRel, InvoiceStatementSelSerRel]),
  ],
  controllers: [WoInvoiceController],
  providers: [
    InvoiceStatementRepository,
    InvoiceStatementInvRelRepository,
    InvoiceStatementSelSerRelRepository,
    InvoiceStatementService,
    InvoiceStatementInvRelService,
    InvoiceStatementSelSerRelService,
    WoInvoiceFacadeService,
  ],
})
export class SrsInvoiceStatementModule {}
