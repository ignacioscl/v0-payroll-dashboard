import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { BaseRepository } from '../../../commons/repository/base.repository'
import { PaginationDto } from '../../../commons/pagination/Pagination.dto'
import { JOBS_CONNECTION } from '../../../jobs/jobs.datasource'
import { JobRunLogQueryDto } from '../dto/job-run-log.dto'
import { JobRunLog } from '../entity/job-run-log.jobsentity'

@Injectable()
export class JobRunLogRepository extends BaseRepository<JobRunLog, JobRunLogQueryDto> {
  constructor(
    @InjectRepository(JobRunLog, JOBS_CONNECTION)
    private readonly _: Repository<JobRunLog>,
  ) {
    super(_.target, _.manager, _.queryRunner)
  }

  public async fetch(payload: JobRunLogQueryDto): Promise<PaginationDto<JobRunLog>> {
    const query = this.createQueryBuilder('l')
    if (payload.id != null) query.andWhere('l.id = :id', { id: payload.id })
    if (payload.idJobRun != null) query.andWhere('l.idJobRun = :run', { run: payload.idJobRun })
    query.orderBy('l.id', 'ASC')
    return this.applyPagination(query, {})
  }
}
