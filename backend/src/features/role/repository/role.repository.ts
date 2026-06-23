import { Injectable } from '@nestjs/common'
import { Repository } from 'typeorm'

import { BaseRepository } from '../../../commons/repository/base.repository'
import { Role } from '../entity/role.entity'
import { RoleQueryDto } from '../dto/role.dto'
import { InjectRepository } from '@nestjs/typeorm'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'

@Injectable()
export class RoleRepository extends BaseRepository<Role, RoleQueryDto> {
  constructor(@InjectRepository(Role) private readonly _: Repository<Role>) {
    super(_.target, _.manager, _.queryRunner)
  }
  public async fetch(payload: RoleQueryDto): Promise<PaginationDto<Role>> {
    const { id, idCompany, roleName } = payload

    const query = this.createQueryBuilder('r').leftJoinAndSelect('r.company', 'company')
    if (id) {
      query.andWhere('r.id = :id', { id })
    }
    if (idCompany) {
      query.andWhere('r.idCompany = :idCompany', { idCompany })
    }
    if (roleName) {
      query.andWhere('UPPER(r.roleName) = :roleName', { roleName: roleName.toUpperCase() })
    }
    return await this.applyPagination(query, payload)
  }
}
