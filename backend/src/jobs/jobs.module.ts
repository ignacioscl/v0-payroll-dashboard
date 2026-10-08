import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'

import { EmailModule } from '../commons/email/email.module'
import { JobRunModule } from '../features/job-run/job-run.module'
import { JobRunLogModule } from '../features/job-run-log/job-run-log.module'
import { PayrollPeriodStateModule } from '../features/payroll-period-state/payroll-period-state.module'
import { SrsAuthModule } from '../srs/auth/srs-auth.module'
import { PayrollSnapshotJob } from '../srs/payroll/snapshot/payroll-snapshot.job'
import { PayrollSnapshotModule } from '../srs/payroll/snapshot/payroll-snapshot.module'
import { JobAlertService } from './job-alert.service'
import { JobRegistryService } from './job-registry.service'
import { JobRunnerService } from './job-runner.service'
import { JOB_HANDLERS, JobHandler } from './job.interface'
import { JobsController } from './jobs.controller'
import { JobsCron } from './jobs.cron'
import { SrsContratistaModule } from '../features/srs-contratista/srs-contratista.module'
import { NoopJob } from './noop.job'
import { WatchdogJob } from './watchdog.job'

/**
 * Worker de jobs dentro del Nest (sin cola ni Redis): runner con lock, registro de jobs, crons,
 * endpoint manual y CLI. Para agregar un job: su clase en `inject` de JOB_HANDLERS
 * (regla worker-jobs.mdc).
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    JobRunModule,
    JobRunLogModule,
    PayrollPeriodStateModule,
    SrsAuthModule,
    EmailModule,
    PayrollSnapshotModule,
    SrsContratistaModule,
  ],
  providers: [
    JobRegistryService,
    JobRunnerService,
    JobAlertService,
    JobsCron,
    NoopJob,
    WatchdogJob,
    {
      provide: JOB_HANDLERS,
      useFactory: (...handlers: JobHandler<any>[]) => handlers,
      inject: [NoopJob, WatchdogJob, PayrollSnapshotJob],
    },
  ],
  controllers: [JobsController],
  exports: [JobRunnerService],
})
export class JobsModule {}
