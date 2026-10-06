import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { JOBS_CONNECTION } from '../../jobs/jobs.datasource'
import { JobRunLog } from './entity/job-run-log.jobsentity'
import { JobRunLogRepository } from './repository/job-run-log.repository'
import { JobRunLogService } from './service/job-run-log.service'

/** `srssui5_srs_jobs.JOB_RUN_LOG`. */
@Module({
  imports: [TypeOrmModule.forFeature([JobRunLog], JOBS_CONNECTION)],
  providers: [JobRunLogRepository, JobRunLogService],
  exports: [JobRunLogService],
})
export class JobRunLogModule {}
