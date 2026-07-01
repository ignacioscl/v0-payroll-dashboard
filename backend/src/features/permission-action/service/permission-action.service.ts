import { Inject, Injectable } from '@nestjs/common'

import { PermissionAction } from '../entity/permission-action.entity'
import { PermissionActionRepository } from '../repository/permission-action.repository'
import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { PermissionActionQueryDto } from '../dto/permission-action.dto'
import { BaseRepository } from 'src/commons/repository/base.repository'

@Injectable()
export class PermissionActionService extends GlobalBaseService<PermissionAction, PermissionActionQueryDto> {
  constructor(@Inject(PermissionActionRepository) private readonly repository: PermissionActionRepository) {
    super()
  }

  protected getRepository(): PermissionActionRepository {
    return this.repository
  }
}
