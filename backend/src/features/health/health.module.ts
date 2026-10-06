import { Module } from '@nestjs/common'
import { TerminusModule } from '@nestjs/terminus'

import { JobRunModule } from '../job-run/job-run.module'
import { JobsHealthIndicator } from '../../jobs/jobs-health.indicator'
import { HealthController } from './health.controller'

@Module({
  imports: [TerminusModule, JobRunModule],
  providers: [JobsHealthIndicator],
  controllers: [HealthController],
})
export class HealthModule {}
