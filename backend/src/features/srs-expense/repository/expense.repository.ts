import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'

import { BaseRepository } from 'src/commons/repository/base.repository'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'
import { ExpenseQueryDto } from '../dto/expense.dto'
import { Expense } from '../entity/expense.entity'

@Injectable()
export class ExpenseRepository extends BaseRepository<Expense, ExpenseQueryDto> {
  constructor(
    @InjectRepository(Expense)
    private readonly _: Repository<Expense>,
  ) {
    super(_.target, _.manager, _.queryRunner)
  }

  public async fetch(payload: ExpenseQueryDto): Promise<PaginationDto<Expense>> {
    const query = this.createQueryBuilder('e')
    if (payload.id != null) query.andWhere('e.id = :id', { id: payload.id })
    if (payload.idDetailer != null) query.andWhere('e.idDetailer = :det', { det: payload.idDetailer })
    if (payload.idExpGroup != null) query.andWhere('e.idExpGroup = :grp', { grp: payload.idExpGroup })
    if (payload.estado != null) query.andWhere('e.estado = :estado', { estado: payload.estado })
    query.orderBy('e.id', 'ASC')
    return this.applyPagination(query, payload)
  }

  /** Un gasto de la empresa (cualquier estado), o null. Siempre acotado por `id_detailer` (tenant). */
  findOwned(id: number, idDetailer: number): Promise<Expense | null> {
    return this.findOne({ where: { id, idDetailer } })
  }

  /** Las filas de un grupo de la empresa, por id; `estado` opcional. */
  findByGroup(idExpGroup: number, idDetailer: number, estado?: number): Promise<Expense[]> {
    return this.find({
      where: estado === undefined ? { idExpGroup, idDetailer } : { idExpGroup, idDetailer, estado },
      order: { id: 'ASC' },
    })
  }

  findOwnedByIds(ids: number[], idDetailer: number): Promise<Expense[]> {
    if (!ids.length) return Promise.resolve([])
    return this.find({ where: { id: In(ids), idDetailer }, order: { id: 'ASC' } })
  }
}
