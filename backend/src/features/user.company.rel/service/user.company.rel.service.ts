import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Transactional } from 'typeorm-transactional'

import { UserCompanyRel } from '../entity/user.company.rel.entity'
import { UserCompanyRelRepository } from '../repository/user.company.rel.repository'
import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { UserCompanyRelQueryDto } from '../dto/user.company.rel.dto'

@Injectable()
export class UserCompanyRelService extends GlobalBaseService<UserCompanyRel, UserCompanyRelQueryDto> {
  constructor(@Inject(UserCompanyRelRepository) private readonly repository: UserCompanyRelRepository) {
    super()
  }

  protected getRepository(): UserCompanyRelRepository {
    return this.repository
  }

  @Transactional()
  async assignUserToCompany(userCompanyRelData: UserCompanyRel): Promise<UserCompanyRel> {
    // Primero eliminar todas las relaciones existentes del usuario con esta compañía

    return await this.create(userCompanyRelData)
  }
  async deleteByUserId(idUser: number): Promise<void> {
    await this.getRepository().deleteByUserId(idUser)
  }
  async deleteById(id: number): Promise<void> {
    await this.getRepository().delete(id)
  }
}
