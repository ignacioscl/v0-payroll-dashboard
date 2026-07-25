import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'

import { BaseRepository } from 'src/commons/repository/base.repository'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'
import { ContratistaQueryDto } from '../dto/contratista.dto'
import { Contratista } from '../entity/contratista.entity'

@Injectable()
export class ContratistaRepository extends BaseRepository<Contratista, ContratistaQueryDto> {
  constructor(
    @InjectRepository(Contratista)
    private readonly _: Repository<Contratista>,
  ) {
    super(_.target, _.manager, _.queryRunner)
  }

  public async fetch(payload: ContratistaQueryDto): Promise<PaginationDto<Contratista>> {
    const query = this.createQueryBuilder('c')
    if (payload.id != null) {
      query.andWhere('c.id = :id', { id: payload.id })
    }
    if (payload.idEmpresa != null) {
      query.andWhere('c.idEmpresa = :idEmpresa', { idEmpresa: payload.idEmpresa })
    }
    return this.applyPagination(query, payload)
  }

  findByIds(ids: number[]) {
    if (!ids.length) return Promise.resolve([] as Contratista[])
    return this.find({ where: { id: In(ids) } })
  }

  /**
   * Dealers in scope for a provider company — same idea as payroll combo (`idDealerProv`):
   * DEALER_REL customer of provider, or CONTRATISTA.id_empresa = provider, or the provider itself.
   */
  async findScopedByIds(ids: number[], idProvider: number): Promise<Contratista[]> {
    if (!ids.length || idProvider < 1) return []
    return this.createQueryBuilder('c')
      .where('c.id IN (:...ids)', { ids })
      .andWhere(
        `(
          c.id = :idProvider
          OR c.idEmpresa = :idProvider
          OR EXISTS (
            SELECT 1 FROM DEALER_REL dr
            WHERE dr.id_dealer_customer = c.id
              AND dr.id_dealer_provider = :idProvider
          )
        )`,
        { idProvider },
      )
      .getMany()
  }
}
