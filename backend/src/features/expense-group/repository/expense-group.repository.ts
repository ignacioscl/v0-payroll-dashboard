import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { BaseRepository } from 'src/commons/repository/base.repository'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'
import { ExpenseGroupQueryDto } from '../dto/expense-group.dto'
import { ExpenseGroup } from '../entity/expense-group.entity'

@Injectable()
export class ExpenseGroupRepository extends BaseRepository<ExpenseGroup, ExpenseGroupQueryDto> {
  constructor(
    @InjectRepository(ExpenseGroup)
    private readonly _: Repository<ExpenseGroup>,
  ) {
    super(_.target, _.manager, _.queryRunner)
  }

  public async fetch(payload: ExpenseGroupQueryDto): Promise<PaginationDto<ExpenseGroup>> {
    const query = this.createQueryBuilder('g').withDeleted()
    if (payload.id != null) query.andWhere('g.id = :id', { id: payload.id })
    if (payload.idDetailer != null) query.andWhere('g.idDetailer = :det', { det: payload.idDetailer })
    query.orderBy('g.id', 'ASC')
    return this.applyPagination(query, payload)
  }

  /** Un grupo de la empresa, borrado o no (`deleted_at` es «sin filas activas», no «invisible»). */
  findOwned(id: number, idDetailer: number): Promise<ExpenseGroup | null> {
    return this.findOne({ where: { id, idDetailer }, withDeleted: true })
  }
}
