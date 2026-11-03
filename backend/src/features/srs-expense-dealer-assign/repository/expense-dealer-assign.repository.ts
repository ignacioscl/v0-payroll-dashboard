import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { BaseRepository } from 'src/commons/repository/base.repository'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'
import { ExpenseDealerAssignQueryDto } from '../dto/expense-dealer-assign.dto'
import { ExpenseDealerAssign } from '../entity/expense-dealer-assign.entity'

/** Una asignación con el nombre del dealer para la empresa de la sesión. */
export interface AssignWithDealer {
  assign: ExpenseDealerAssign
  dealerName: string
}

@Injectable()
export class ExpenseDealerAssignRepository extends BaseRepository<ExpenseDealerAssign, ExpenseDealerAssignQueryDto> {
  constructor(
    @InjectRepository(ExpenseDealerAssign)
    private readonly _: Repository<ExpenseDealerAssign>,
  ) {
    super(_.target, _.manager, _.queryRunner)
  }

  public async fetch(payload: ExpenseDealerAssignQueryDto): Promise<PaginationDto<ExpenseDealerAssign>> {
    const query = this.createQueryBuilder('a')
    if (payload.id != null) query.andWhere('a.id = :id', { id: payload.id })
    if (payload.idExpRepetitive != null) {
      query.andWhere('a.idExpRepetitive = :rule', { rule: payload.idExpRepetitive })
    }
    query.orderBy('a.id', 'ASC')
    return this.applyPagination(query, payload)
  }

  /** Los dealers de una regla, por id (como `loadAssign` legacy). */
  listForRule(idExpRepetitive: number): Promise<ExpenseDealerAssign[]> {
    return this.find({ where: { idExpRepetitive }, order: { id: 'ASC' } })
  }

  /**
   * Los dealers de una regla con su nombre por `GET_DEALER_NAME_BY_PROVIDER(provider, dealer)` (regla
   * dealer-display-name-by-provider). El provider es el de la sesión.
   */
  listForRuleWithNames(idExpRepetitive: number, idDealerProvider: number): Promise<AssignWithDealer[]> {
    return this.listForRulesWithNames([idExpRepetitive], idDealerProvider)
  }

  /** Lo mismo para varias reglas en una consulta (los avisos de una página del listado). */
  async listForRulesWithNames(idsExpRepetitive: number[], idDealerProvider: number): Promise<AssignWithDealer[]> {
    if (!idsExpRepetitive.length) return []
    const { entities, raw } = await this.createQueryBuilder('a')
      .addSelect('GET_DEALER_NAME_BY_PROVIDER(:prov, a.id_dealer)', 'dealerName')
      .where('a.idExpRepetitive IN (:...rules)', { rules: idsExpRepetitive })
      .setParameter('prov', idDealerProvider)
      .orderBy('a.id', 'ASC')
      .getRawAndEntities()
    return entities.map((assign, i) => ({ assign, dealerName: String(raw[i]?.dealerName ?? assign.idDealer) }))
  }

  /** Un dealer de una regla, o null. */
  findWithRule(id: number): Promise<ExpenseDealerAssign | null> {
    return this.findOne({ where: { id } })
  }

  /** Ids de dealer que ya están en la regla (para ignorar duplicados como hoy, sin ON DUPLICATE KEY). */
  async dealerIdsInRule(idExpRepetitive: number): Promise<number[]> {
    const rows = await this.listForRule(idExpRepetitive)
    return rows.map((r) => Number(r.idDealer))
  }
}
