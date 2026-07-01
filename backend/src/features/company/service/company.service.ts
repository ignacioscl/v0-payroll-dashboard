import { Inject, Injectable } from '@nestjs/common'

import { Company } from '../entity/company.entity'
import { CompanyRepository } from '../repository/company.repository'
import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { CompanyQueryDto } from '../dto/company.dto'
import { BaseRepository } from 'src/commons/repository/base.repository'

@Injectable()
export class CompanyService extends GlobalBaseService<Company, CompanyQueryDto> {
  constructor(@Inject(CompanyRepository) private readonly repository: CompanyRepository) {
    super()
  }

  protected getRepository(): CompanyRepository {
    return this.repository
  }
}
