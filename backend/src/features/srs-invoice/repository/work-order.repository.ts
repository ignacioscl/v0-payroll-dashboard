import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { BaseRepository } from 'src/commons/repository/base.repository'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'
import { WorkOrderQueryDto } from '../dto/work-order.dto'
import { WorkOrder } from '../entity/work-order.entity'

/** `INVOICE` (la WO). Las escrituras tocan solo las columnas del `GRANT` de la migration 035. */
@Injectable()
export class WorkOrderRepository extends BaseRepository<WorkOrder, WorkOrderQueryDto> {
  constructor(
    @InjectRepository(WorkOrder)
    private readonly _: Repository<WorkOrder>,
  ) {
    super(_.target, _.manager, _.queryRunner)
  }

  public async fetch(payload: WorkOrderQueryDto): Promise<PaginationDto<WorkOrder>> {
    const query = this.createQueryBuilder('t')
    if (payload.id != null) query.andWhere('t.id = :id', { id: payload.id })
    query.orderBy('t.id', 'DESC')
    return this.applyPagination(query, payload)
  }
}
