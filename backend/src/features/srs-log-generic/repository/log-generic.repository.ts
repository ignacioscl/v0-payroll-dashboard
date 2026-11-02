import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { BaseRepository } from 'src/commons/repository/base.repository'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'
import { LogGenericQueryDto } from '../dto/log-generic.dto'
import { LogGeneric, LOG_GENERIC_TIPO_EXPENSE } from '../entity/log-generic.entity'

@Injectable()
export class LogGenericRepository extends BaseRepository<LogGeneric, LogGenericQueryDto> {
  constructor(
    @InjectRepository(LogGeneric)
    private readonly _: Repository<LogGeneric>,
  ) {
    super(_.target, _.manager, _.queryRunner)
  }

  public async fetch(payload: LogGenericQueryDto): Promise<PaginationDto<LogGeneric>> {
    const query = this.createQueryBuilder('l')
    if (payload.id != null) query.andWhere('l.id = :id', { id: payload.id })
    if (payload.idExpense != null) query.andWhere('l.idExpense = :exp', { exp: payload.idExpense })
    if (payload.idExpGroup != null) query.andWhere('l.idExpGroup = :grp', { grp: payload.idExpGroup })
    if (payload.tipo != null) query.andWhere('l.tipo = :tipo', { tipo: payload.tipo })
    query.orderBy('l.id', 'DESC')
    return this.applyPagination(query, payload)
  }

  /** El log de un gasto y, si tiene grupo, el del grupo (tipo 7), del más nuevo al más viejo. */
  listForExpense(idExpense: number, idExpGroup: number | null): Promise<LogGeneric[]> {
    const query = this.createQueryBuilder('l')
      .where('l.tipo = :tipo', { tipo: LOG_GENERIC_TIPO_EXPENSE })
      .andWhere(idExpGroup ? '(l.idExpense = :exp OR l.idExpGroup = :grp)' : 'l.idExpense = :exp', {
        exp: idExpense,
        grp: idExpGroup ?? 0,
      })
    return query.orderBy('l.id', 'DESC').getMany()
  }
}
