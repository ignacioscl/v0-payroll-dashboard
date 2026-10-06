import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { JOBS_CONNECTION } from '../../jobs/jobs.datasource'
import { JobRun } from './entity/job-run.jobsentity'
import { JobRunRepository } from './repository/job-run.repository'
import { JobRunService } from './service/job-run.service'

/** `srssui5_srs_jobs.JOB_RUN`. Sin controller propio: lo expone `src/jobs/jobs.controller.ts`. */
@Module({
  imports: [TypeOrmModule.forFeature([JobRun], JOBS_CONNECTION)],
  providers: [JobRunRepository, JobRunService],
  exports: [JobRunService],
})
export class JobRunModule {}
