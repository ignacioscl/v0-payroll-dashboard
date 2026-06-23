import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { Company } from '../entity/company.entity'
import { BaseRepository } from 'src/commons/repository/base.repository'
import { CompanyPaginationDto, CompanyQueryDto } from '../dto/company.dto'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'

@Injectable()
export class CompanyRepository extends BaseRepository<Company, CompanyQueryDto> {
  constructor(@InjectRepository(Company) private readonly _: Repository<Company>) {
    super(_.target, _.manager, _.queryRunner)
  }
  public async fetch(payload: CompanyQueryDto): Promise<PaginationDto<Company>> {
    const { id, idCompanyParent, isParent } = payload

    const query = this.createQueryBuilder('company').leftJoinAndSelect('company.parent', 'parent')

    if (id) {
      query.andWhere('company.id = :id', { id })
    }

    if (idCompanyParent) {
      query.andWhere('company.id_parent = :idCompanyParent', { idCompanyParent })
    }

    if (isParent == 1) {
      query.andWhere('company.id_parent IS NULL')
    }
    if (isParent == 0) {
      query.andWhere('company.id_parent IS NOT NULL')
    }

    return await this.applyPagination(query, payload)
  }
}
