import { Inject, Injectable } from '@nestjs/common'

import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { RolAccionRelQueryDto } from '../dto/srs-rol.dto'
import { RolAccionRel } from '../entity/rol-accion-rel.entity'
import { RolAccionRelRepository } from '../repository/rol-accion-rel.repository'

@Injectable()
export class RolAccionRelService extends GlobalBaseService<RolAccionRel, RolAccionRelQueryDto> {
  constructor(
    @Inject(RolAccionRelRepository) private readonly repository: RolAccionRelRepository,
  ) {
    super()
  }

  protected getRepository(): RolAccionRelRepository {
    return this.repository
  }

  replaceForRole(idRol: number, idsRolAccion: number[]) {
    return this.repository.replaceForRole(idRol, idsRolAccion)
  }

  replaceForTemplateChildren(idTemplate: number, idsRolAccion: number[]) {
    return this.repository.replaceForTemplateChildren(idTemplate, idsRolAccion)
  }

  countByRoleIds(ids: number[]) {
    return this.repository.countByRoleIds(ids)
  }

  countForRoleAndAccion(idRol: number, idRolAccion: number) {
    return this.repository.countForRoleAndAccion(idRol, idRolAccion)
  }

  listAccionIds(idRol: number) {
    return this.repository.listAccionIds(idRol)
  }
}
