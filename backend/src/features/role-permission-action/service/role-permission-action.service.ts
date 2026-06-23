import { Inject, Injectable } from '@nestjs/common'

import { RolePermissionAction } from '../entity/role-permission-action.entity'
import { RolePermissionActionRepository } from '../repository/role-permission-action.repository'
import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { RolePermissionActionQueryDto } from '../dto/role-permission-action.dto'
import { BaseRepository } from 'src/commons/repository/base.repository'

@Injectable()
export class RolePermissionActionService extends GlobalBaseService<RolePermissionAction, RolePermissionActionQueryDto> {
  constructor(@Inject(RolePermissionActionRepository) private readonly repository: RolePermissionActionRepository) {
    super()
  }

  protected getRepository(): RolePermissionActionRepository {
    return this.repository
  }

  public async deleteByIdRoleAndIdPermissionAction(idRole: number, idPermissionAction: number): Promise<void> {
    await this.getRepository().deleteByIdRoleAndIdPermissionAction(idRole, idPermissionAction)
  }
}
