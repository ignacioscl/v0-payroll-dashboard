import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { BaseRepository } from '../../../commons/repository/base.repository'
import { PaginationDto } from '../../../commons/pagination/Pagination.dto'
import { JOBS_CONNECTION } from '../../../jobs/jobs.datasource'
import { PayrollPeriodStateQueryDto } from '../dto/payroll-period-state.dto'
import { PayrollPeriodState } from '../entity/payroll-period-state.jobsentity'

@Injectable()
export class PayrollPeriodStateRepository extends BaseRepository<PayrollPeriodState, PayrollPeriodStateQueryDto> {
  constructor(
    @InjectRepository(PayrollPeriodState, JOBS_CONNECTION)
    private readonly _: Repository<PayrollPeriodState>,
  ) {
    super(_.target, _.manager, _.queryRunner)
  }

  public async fetch(payload: PayrollPeriodStateQueryDto): Promise<PaginationDto<PayrollPeriodState>> {
    const query = this.createQueryBuilder('s')
    if (payload.id != null) query.andWhere('s.id = :id', { id: payload.id })
    if (payload.idContratista != null) {
      query.andWhere('s.idContratista = :p', { p: payload.idContratista })
    }
    if (payload.periodoDesde) query.andWhere('s.periodoDesde = :d', { d: payload.periodoDesde })
    query.orderBy('s.periodoDesde', 'ASC')
    return this.applyPagination(query, {})
  }
}
