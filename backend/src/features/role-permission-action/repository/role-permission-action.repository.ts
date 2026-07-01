import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { RolePermissionAction } from '../entity/role-permission-action.entity'
import { BaseRepository } from 'src/commons/repository/base.repository'
import { RolePermissionActionPaginationDto, RolePermissionActionQueryDto } from '../dto/role-permission-action.dto'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'

@Injectable()
export class RolePermissionActionRepository extends BaseRepository<RolePermissionAction, RolePermissionActionQueryDto> {
  constructor(@InjectRepository(RolePermissionAction) private readonly _: Repository<RolePermissionAction>) {
    super(_.target, _.manager, _.queryRunner)
  }
  public async fetch(payload: RolePermissionActionQueryDto): Promise<PaginationDto<RolePermissionAction>> {
    const query = this.createQueryBuilder('rpa')
    if (payload.id != null) {
      query.andWhere('rpa.id = :id', { id: payload.id })
    }
    if (payload.idRole != null) {
      query.andWhere('rpa.idRole = :idRole', { idRole: payload.idRole })
    }
    return await this.applyPagination(query, payload)
  }
  public async deleteByIdRoleAndIdPermissionAction(idRole: number, idPermissionAction: number): Promise<void> {
    await this.delete({ idRole, idPermissionAction })
  }
}
