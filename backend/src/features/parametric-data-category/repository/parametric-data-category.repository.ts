import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { ParametricDataCategory } from '../entity/parametric-data-category.entity'
import { BaseRepository } from 'src/commons/repository/base.repository'
import {
  ParametricDataCategoryPaginationDto,
  ParametricDataCategoryQueryDto,
} from '../dto/parametric-data-category.dto'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'

@Injectable()
export class ParametricDataCategoryRepository extends BaseRepository<
  ParametricDataCategory,
  ParametricDataCategoryQueryDto
> {
  constructor(@InjectRepository(ParametricDataCategory) private readonly _: Repository<ParametricDataCategory>) {
    super(_.target, _.manager, _.queryRunner)
  }
  public async fetch(payload: ParametricDataCategoryQueryDto): Promise<PaginationDto<ParametricDataCategory>> {
    const { id } = payload

    const query = this.createQueryBuilder('p')

    if (id) {
      query.andWhere('p.id = :id', { id })
    }

    return await this.applyPagination(query, payload)
  }
}
