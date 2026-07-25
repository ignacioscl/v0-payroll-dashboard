import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { BaseRepository } from 'src/commons/repository/base.repository'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'
import { RolActivityLogQueryDto } from '../dto/rol-template.dto'
import { RolActivityLog } from '../entity/rol-activity-log.entity'

@Injectable()
export class RolActivityLogRepository extends BaseRepository<RolActivityLog, RolActivityLogQueryDto> {
  constructor(
    @InjectRepository(RolActivityLog)
    private readonly _: Repository<RolActivityLog>,
  ) {
    super(_.target, _.manager, _.queryRunner)
  }

  public async fetch(payload: RolActivityLogQueryDto): Promise<PaginationDto<RolActivityLog>> {
    const query = this.createQueryBuilder('l')
    if (payload.idRolTemplate != null) {
      query.andWhere('l.idRolTemplate = :idTpl', { idTpl: payload.idRolTemplate })
    }
    if (payload.idRol != null) {
      query.andWhere('l.idRol = :idRol', { idRol: payload.idRol })
    }
    query.orderBy('l.id', 'DESC')
    return this.applyPagination(query, payload)
  }

  listForTemplate(idRolTemplate: number, take = 100) {
    return this.find({
      where: { idRolTemplate },
      order: { id: 'DESC' },
      take,
    })
  }

  listForRole(idRol: number, take = 100) {
    return this.find({
      where: { idRol },
      order: { id: 'DESC' },
      take,
    })
  }
}
