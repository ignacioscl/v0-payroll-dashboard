import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { BaseRepository } from '../../../commons/repository/base.repository'
import { PaginationDto } from '../../../commons/pagination/Pagination.dto'
import { JOBS_CONNECTION } from '../../../jobs/jobs.datasource'
import { JobRunQueryDto } from '../dto/job-run.dto'
import { JobRun } from '../entity/job-run.jobsentity'

@Injectable()
export class JobRunRepository extends BaseRepository<JobRun, JobRunQueryDto> {
  constructor(
    @InjectRepository(JobRun, JOBS_CONNECTION)
    private readonly _: Repository<JobRun>,
  ) {
    super(_.target, _.manager, _.queryRunner)
  }

  public async fetch(payload: JobRunQueryDto): Promise<PaginationDto<JobRun>> {
    const query = this.createQueryBuilder('r')
    if (payload.id != null) query.andWhere('r.id = :id', { id: payload.id })
    if (payload.name) query.andWhere('r.jobName = :name', { name: payload.name })
    query.orderBy('r.id', 'DESC')
    return this.applyPagination(query, { page: 0, pageSize: payload.limit ?? 20 })
  }
}
