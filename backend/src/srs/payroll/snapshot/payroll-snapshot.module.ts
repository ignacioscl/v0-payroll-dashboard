import { Module } from '@nestjs/common'

import { PayrollPeriodStateModule } from '../../../features/payroll-period-state/payroll-period-state.module'
import { PayrollSnapshotDayModule } from '../../../features/payroll-snapshot-day/payroll-snapshot-day.module'
import { PayrollFingerprintRepository } from './payroll-fingerprint.repository'
import { PayrollSnapshotJob } from './payroll-snapshot.job'
import { PayrollSnapshotWriter } from './payroll-snapshot.writer'
import { PayrollSourceRepository } from './payroll-source.repository'

/** El job `payroll-snapshot` y sus piezas. Lo registra `JobsModule`. */
@Module({
  imports: [PayrollPeriodStateModule, PayrollSnapshotDayModule],
  providers: [PayrollSourceRepository, PayrollFingerprintRepository, PayrollSnapshotWriter, PayrollSnapshotJob],
  exports: [PayrollSnapshotJob, PayrollSourceRepository],
})
export class PayrollSnapshotModule {}
