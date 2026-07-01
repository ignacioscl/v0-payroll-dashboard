import { Inject, Injectable } from '@nestjs/common'

import { ParametricData } from '../entity/parametric-data.entity'
import { ParametricDataRepository } from '../repository/parametric-data.repository'
import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { ParametricDataQueryDto } from '../dto/parametric-data.dto'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'

@Injectable()
export class ParametricDataService extends GlobalBaseService<ParametricData, ParametricDataQueryDto> {
  constructor(@Inject(ParametricDataRepository) private readonly repository: ParametricDataRepository) {
    super()
  }

  protected getRepository(): ParametricDataRepository {
    return this.repository
  }
  public async fetchPermissions(payload: ParametricDataQueryDto): Promise<PaginationDto<any>> {
    return await this.getRepository().fetchPermissionRaw(payload)
  }
}
