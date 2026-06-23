import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { GeneralData } from '../entity/general-data.entity'
import { BaseRepository } from 'src/commons/repository/base.repository'
import { GeneralDataPaginationDto, GeneralDataQueryDto } from '../dto/general-data.dto'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'

@Injectable()
export class GeneralDataRepository extends BaseRepository<GeneralData, GeneralDataQueryDto> {
  constructor(@InjectRepository(GeneralData) private readonly _: Repository<GeneralData>) {
    super(_.target, _.manager, _.queryRunner)
  }
  public async fetch(payload: GeneralDataQueryDto): Promise<PaginationDto<GeneralData>> {
    const { id, idCategory, descriptionEquals, idUser } = payload

    const query = this.createQueryBuilder('gd')
    if (id) {
      query.andWhere('gd.id = :id', { id })
    }

    if (idCategory) {
      query.andWhere('gd.id_category = :idCategory', { idCategory })
    }
    if (idUser) {
      query.andWhere('gd.id_user = :idUser', { idUser })
    }

    if (descriptionEquals) {
      query.andWhere('UPPER(gd.description) = :descriptionEquals', {
        descriptionEquals: descriptionEquals.toUpperCase(),
      })
    }

    return await this.applyPagination(query, payload)
  }
}
