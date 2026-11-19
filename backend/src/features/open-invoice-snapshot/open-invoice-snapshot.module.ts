import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { OpenInvoiceSnapshot } from './entity/open-invoice-snapshot.entity'
import { OpenInvoiceSnapshotRepository } from './repository/open-invoice-snapshot.repository'
import { OpenInvoiceSnapshotService } from './service/open-invoice-snapshot.service'

/** `OPEN_INVOICE_SNAPSHOT` (migration 031) on the default connection (same database as the PHP). */
@Module({
  imports: [TypeOrmModule.forFeature([OpenInvoiceSnapshot])],
  providers: [OpenInvoiceSnapshotRepository, OpenInvoiceSnapshotService],
  exports: [OpenInvoiceSnapshotService],
})
export class OpenInvoiceSnapshotModule {}
