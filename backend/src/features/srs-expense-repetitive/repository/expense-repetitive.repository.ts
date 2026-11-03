import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { BaseRepository } from 'src/commons/repository/base.repository'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'
import { GenericData } from 'src/features/srs-generic-data/entity/generic-data.entity'
import { ExpenseRepetitiveQueryDto } from '../dto/expense-repetitive.dto'
import { ExpenseRepetitive } from '../entity/expense-repetitive.entity'

/** Una regla con los nombres de compañía y categoría y su cantidad de dealers. */
export interface RuleListRow {
  rule: ExpenseRepetitive
  companyName: string
  categoryName: string
  dealersCount: number
}

@Injectable()
export class ExpenseRepetitiveRepository extends BaseRepository<ExpenseRepetitive, ExpenseRepetitiveQueryDto> {
  constructor(
    @InjectRepository(ExpenseRepetitive)
    private readonly _: Repository<ExpenseRepetitive>,
  ) {
    super(_.target, _.manager, _.queryRunner)
  }

  public async fetch(payload: ExpenseRepetitiveQueryDto): Promise<PaginationDto<ExpenseRepetitive>> {
    const query = this.createQueryBuilder('r')
    if (payload.id != null) query.andWhere('r.id = :id', { id: payload.id })
    if (payload.idDealerProvider != null) {
      query.andWhere('r.idDealerProvider = :prov', { prov: payload.idDealerProvider })
    }
    if (payload.status != null) query.andWhere('r.status = :status', { status: payload.status })
    const term = payload.term?.trim()
    if (term) query.andWhere('r.description LIKE :term', { term: `%${term}%` })
    query.orderBy('r.id', 'DESC')
    return this.applyPagination(query, payload)
  }

  /** `belongsToProvider` legacy: la regla es de la empresa (cualquier status). */
  findOwned(id: number, idDealerProvider: number): Promise<ExpenseRepetitive | null> {
    return this.findOne({ where: { id, idDealerProvider } })
  }

  /** Reglas activas de la empresa con nombres y conteo de dealers; `page` base 0. */
  async listActive(input: {
    idDealerProvider: number
    term?: string
    page: number
    pageSize: number
  }): Promise<{ rows: RuleListRow[]; total: number }> {
    const base = this.createQueryBuilder('r')
      .where('r.idDealerProvider = :prov', { prov: input.idDealerProvider })
      .andWhere('r.status = 1')
    const term = input.term?.trim()
    if (term) base.andWhere('r.description LIKE :term', { term: `%${term}%` })
    const total = await base.clone().getCount()
    const { entities, raw } = await base
      .clone()
      .leftJoin(GenericData, 'gco', 'gco.id = r.idCompany')
      .leftJoin(GenericData, 'gca', 'gca.id = r.idCategory')
      .addSelect('gco.name', 'companyName')
      .addSelect('gca.name', 'categoryName')
      .addSelect(
        '(SELECT COUNT(*) FROM EXP_EXPENSE_DEALER_ASSIGN a WHERE a.id_exp_repetitive = r.id)',
        'dealersCount',
      )
      .orderBy('r.id', 'DESC')
      .offset(input.page * input.pageSize)
      .limit(input.pageSize)
      .getRawAndEntities()
    return {
      total,
      rows: entities.map((rule, i) => ({
        rule,
        companyName: String(raw[i]?.companyName ?? ''),
        categoryName: String(raw[i]?.categoryName ?? ''),
        dealersCount: Number(raw[i]?.dealersCount ?? 0),
      })),
    }
  }

  /** Todas las reglas activas de la empresa (para las tarjetas del listado). */
  listAllActive(idDealerProvider: number): Promise<ExpenseRepetitive[]> {
    return this.find({ where: { idDealerProvider, status: 1 }, order: { id: 'DESC' } })
  }
}
