import { Inject, Injectable } from '@nestjs/common'

import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { RolTemplateQueryDto } from '../dto/rol-template.dto'
import { RolTemplate } from '../entity/rol-template.entity'
import { RolTemplateRepository } from '../repository/rol-template.repository'

@Injectable()
export class RolTemplateService extends GlobalBaseService<RolTemplate, RolTemplateQueryDto> {
  constructor(
    @Inject(RolTemplateRepository) private readonly repository: RolTemplateRepository,
  ) {
    super()
  }

  protected getRepository(): RolTemplateRepository {
    return this.repository
  }

  findOwned(id: number, idCompaniaOwner: number) {
    return this.findOneByFilter({ where: { id, idCompaniaOwner } })
  }
}
