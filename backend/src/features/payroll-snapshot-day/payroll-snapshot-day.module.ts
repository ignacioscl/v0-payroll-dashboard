import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { PayrollSnapshotDay } from './entity/payroll-snapshot-day.entity'
import { PayrollSnapshotDayRepository } from './repository/payroll-snapshot-day.repository'
import { PayrollSnapshotDayService } from './service/payroll-snapshot-day.service'

/** `PAYROLL_SNAPSHOT_DAY` en la conexión default (misma base que el PHP). */
@Module({
  imports: [TypeOrmModule.forFeature([PayrollSnapshotDay])],
  providers: [PayrollSnapshotDayRepository, PayrollSnapshotDayService],
  exports: [PayrollSnapshotDayService],
})
export class PayrollSnapshotDayModule {}
