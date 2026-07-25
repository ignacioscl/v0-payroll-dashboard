import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { BaseRepository } from 'src/commons/repository/base.repository'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'
import { RolTemplateQueryDto } from '../dto/rol-template.dto'
import { RolTemplate } from '../entity/rol-template.entity'

@Injectable()
export class RolTemplateRepository extends BaseRepository<RolTemplate, RolTemplateQueryDto> {
  constructor(
    @InjectRepository(RolTemplate)
    private readonly _: Repository<RolTemplate>,
  ) {
    super(_.target, _.manager, _.queryRunner)
  }

  public async fetch(payload: RolTemplateQueryDto): Promise<PaginationDto<RolTemplate>> {
    const query = this.createQueryBuilder('t')

    if (payload.id != null) {
      query.andWhere('t.id = :id', { id: payload.id })
    }
    if (payload.idCompaniaOwner != null) {
      query.andWhere('t.idCompaniaOwner = :owner', { owner: payload.idCompaniaOwner })
    }
    if (payload.type === '1' || payload.type === '2') {
      query.andWhere('t.tipo = :tipo', { tipo: Number(payload.type) })
    }
    if (payload.estado === '0' || payload.estado === '1') {
      query.andWhere('t.estado = :estado', { estado: Number(payload.estado) })
    } else {
      query.andWhere('t.estado = 1')
    }
    const term = payload.term?.trim()
    if (term) {
      query.andWhere('t.nombre LIKE :term', { term: `%${term}%` })
    }

    query.orderBy('t.nombre', 'ASC')
    return this.applyPagination(query, payload)
  }
}
