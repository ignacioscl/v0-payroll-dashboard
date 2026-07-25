import { Inject, Injectable } from '@nestjs/common'

import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { RolAccionRelTemplateQueryDto } from '../dto/rol-template.dto'
import { RolAccionRelTemplate } from '../entity/rol-accion-rel-template.entity'
import { RolAccionRelTemplateRepository } from '../repository/rol-accion-rel-template.repository'

@Injectable()
export class RolAccionRelTemplateService extends GlobalBaseService<
  RolAccionRelTemplate,
  RolAccionRelTemplateQueryDto
> {
  constructor(
    @Inject(RolAccionRelTemplateRepository)
    private readonly repository: RolAccionRelTemplateRepository,
  ) {
    super()
  }

  protected getRepository(): RolAccionRelTemplateRepository {
    return this.repository
  }

  listAccionIds(idRolTemplate: number) {
    return this.repository.listAccionIds(idRolTemplate)
  }

  replaceForTemplate(idRolTemplate: number, idsRolAccion: number[]) {
    return this.repository.replaceForTemplate(idRolTemplate, idsRolAccion)
  }
}
