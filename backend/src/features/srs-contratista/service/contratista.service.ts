import { Inject, Injectable } from '@nestjs/common'

import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { ContratistaQueryDto } from '../dto/contratista.dto'
import { Contratista } from '../entity/contratista.entity'
import { ContratistaRepository } from '../repository/contratista.repository'

@Injectable()
export class ContratistaService extends GlobalBaseService<Contratista, ContratistaQueryDto> {
  constructor(
    @Inject(ContratistaRepository) private readonly repository: ContratistaRepository,
  ) {
    super()
  }

  protected getRepository(): ContratistaRepository {
    return this.repository
  }

  findManyByIds(ids: number[]) {
    return this.repository.findByIds(ids)
  }

  /** Dealers valid for this provider (DEALER_REL / id_empresa / self). */
  findScopedByIds(ids: number[], idProvider: number) {
    return this.repository.findScopedByIds(ids, idProvider)
  }
}
