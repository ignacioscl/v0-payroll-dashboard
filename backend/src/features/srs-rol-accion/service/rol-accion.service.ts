import { Inject, Injectable } from '@nestjs/common'

import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { RolAccionQueryDto } from '../dto/rol-accion.dto'
import { RolAccion } from '../entity/rol-accion.entity'
import { RolAccionRepository, RolAccionRoleContext } from '../repository/rol-accion.repository'

@Injectable()
export class RolAccionService extends GlobalBaseService<RolAccion, RolAccionQueryDto> {
  constructor(@Inject(RolAccionRepository) private readonly repository: RolAccionRepository) {
    super()
  }

  protected getRepository(): RolAccionRepository {
    return this.repository
  }

  listForRoleContext(context: RolAccionRoleContext) {
    return this.repository.listForRoleContext(context)
  }

  findValidIdsForRoleContext(ids: number[], context: RolAccionRoleContext) {
    return this.repository.findValidIdsForRoleContext(ids, context)
  }

  findActionsByIds(ids: number[]) {
    return this.repository.findActionsByIds(ids)
  }

  findNombresByIds(ids: number[]) {
    return this.repository.findNombresByIds(ids)
  }
}
