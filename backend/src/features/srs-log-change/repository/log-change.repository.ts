import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { BaseRepository } from 'src/commons/repository/base.repository'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'
import { LogChangeQueryDto } from '../dto/log-change.dto'
import { LogChange } from '../entity/log-change.entity'

@Injectable()
export class LogChangeRepository extends BaseRepository<LogChange, LogChangeQueryDto> {
  constructor(
    @InjectRepository(LogChange)
    private readonly _: Repository<LogChange>,
  ) {
    super(_.target, _.manager, _.queryRunner)
  }

  public async fetch(payload: LogChangeQueryDto): Promise<PaginationDto<LogChange>> {
    const query = this.createQueryBuilder('l')
    if (payload.id != null) query.andWhere('l.id = :id', { id: payload.id })
    if (payload.idExpRepetitive != null) {
      query.andWhere('l.idExpRepetitive = :rule', { rule: payload.idExpRepetitive })
    }
    query.orderBy('l.id', 'DESC')
    return this.applyPagination(query, payload)
  }

  listForRule(idExpRepetitive: number, take = 200): Promise<LogChange[]> {
    return this.find({ where: { idExpRepetitive }, order: { id: 'DESC' }, take })
  }
}
