import { Inject, Injectable } from '@nestjs/common'

import { ParametricDataCategory } from '../entity/parametric-data-category.entity'
import { ParametricDataCategoryRepository } from '../repository/parametric-data-category.repository'
import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { ParametricDataCategoryQueryDto } from '../dto/parametric-data-category.dto'
import { BaseRepository } from 'src/commons/repository/base.repository'

@Injectable()
export class ParametricDataCategoryService extends GlobalBaseService<
  ParametricDataCategory,
  ParametricDataCategoryQueryDto
> {
  constructor(@Inject(ParametricDataCategoryRepository) private readonly repository: ParametricDataCategoryRepository) {
    super()
  }

  protected getRepository(): ParametricDataCategoryRepository {
    return this.repository
  }
}
