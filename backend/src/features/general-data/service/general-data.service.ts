import { Inject, Injectable } from '@nestjs/common'

import { GeneralData } from '../entity/general-data.entity'
import { GeneralDataRepository } from '../repository/general-data.repository'
import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { GeneralDataDto, GeneralDataQueryDto, UpdateGeneralDataDto } from '../dto/general-data.dto'

@Injectable()
export class GeneralDataService extends GlobalBaseService<GeneralData, GeneralDataQueryDto> {
  constructor(
    @Inject(GeneralDataRepository) private readonly repository: GeneralDataRepository,
  ) {
    super()
  }

  protected getRepository(): GeneralDataRepository {
    return this.repository
  }

  /**
   * Find or create a general data por categoria
   * @param idCategory - The category ID of the general data
   * @param description
   * @returns The general data
   */
  async findOrCreate(idCategory: number, description: string): Promise<GeneralData> {
    const existing = await this.repository.findOne({
      where: {
        idCategory,
        description,
      },
    })

    if (existing) {
      return existing
    }

    return await this.repository.save({ idCategory, description })
  }

  /**
   * Find or create a general data por usuario y categoria
   */
  async updateOrCreatePaymentMethodByUser(payload: GeneralDataDto): Promise<GeneralDataDto> {
    const paymentMethod = await this.repository.findOne({
      where: {
        idUser: payload.idUser,
        idCategory: payload.idCategory,
        dateFrom: payload.dateFrom,
      },
    })

    let result: GeneralDataDto

    if (paymentMethod) {
      await this.updateById(paymentMethod.id!, payload as UpdateGeneralDataDto)
      result = payload
    } else {
      result = await this.create(payload)
    }

    return result
  }
}
