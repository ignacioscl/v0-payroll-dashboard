import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { BaseRepository } from 'src/commons/repository/base.repository'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'
import { UsuarioSrsQueryDto } from '../dto/usuario-srs.dto'
import { UsuarioSrs } from '../entity/usuario-srs.entity'

@Injectable()
export class UsuarioSrsRepository extends BaseRepository<UsuarioSrs, UsuarioSrsQueryDto> {
  constructor(
    @InjectRepository(UsuarioSrs)
    private readonly _: Repository<UsuarioSrs>,
  ) {
    super(_.target, _.manager, _.queryRunner)
  }

  public async fetch(payload: UsuarioSrsQueryDto): Promise<PaginationDto<UsuarioSrs>> {
    const query = this.createQueryBuilder('u')
    if (payload.id != null) {
      query.andWhere('u.idUsuario = :id', { id: payload.id })
    }
    return this.applyPagination(query, payload)
  }
}
