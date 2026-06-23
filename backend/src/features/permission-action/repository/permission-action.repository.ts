import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { PermissionAction } from '../entity/permission-action.entity'
import { PermissionActionQueryDto } from '../dto/permission-action.dto'
import { BaseRepository } from '../../../commons/repository/base.repository'

@Injectable()
export class PermissionActionRepository extends BaseRepository<PermissionAction, PermissionActionQueryDto> {
  constructor(@InjectRepository(PermissionAction) private readonly _: Repository<PermissionAction>) {
    super(_.target, _.manager, _.queryRunner)
  }

  async fetch(payload: PermissionActionQueryDto) {
    const queryBuilder = this.createQueryBuilder('permissionAction').leftJoinAndSelect(
      'permissionAction.parametricData',
      'parametricData',
    )
    if (payload.id) {
      queryBuilder.andWhere('permissionAction.id = :id', { id: payload.id })
    }
    // Aplicar filtros
    if (payload.codePage) {
      queryBuilder.andWhere('permissionAction.codePage = :codePage', { codePage: payload.codePage })
    }

    if (payload.orderBy) {
      this.getOrderBy(queryBuilder, payload)
    } else {
      queryBuilder.orderBy('permissionAction.orderBy', 'ASC')
    }

    return this.applyPagination(queryBuilder, payload)
  }
}
