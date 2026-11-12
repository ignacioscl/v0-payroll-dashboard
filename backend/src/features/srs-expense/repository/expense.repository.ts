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

  /**
   * Gastos de la empresa que usan una compañía o categoría del catálogo: vivos y no vivos, contados como la columna
   * «Expenses» de Settings (un gasto repartido cuenta una vez). Siempre acotado por `id_detailer`.
   */
  async catalogUsage(field: 'idCompany' | 'idCategory', idCatalog: number, idDetailer: number): Promise<{ live: number; notLive: number }> {
    const raw = await this.createQueryBuilder('e')
      .select(
        "COUNT(DISTINCT CASE WHEN e.estado = 1 THEN IF(e.id_exp_group IS NULL, CONCAT('e', e.id), CONCAT('g', e.id_exp_group)) END)",
        'live',
      )
      .addSelect(
        "COUNT(DISTINCT CASE WHEN e.estado <> 1 THEN IF(e.id_exp_group IS NULL, CONCAT('e', e.id), CONCAT('g', e.id_exp_group)) END)",
        'notLive',
      )
      .where(`e.${field} = :idCatalog`, { idCatalog })
      .andWhere('e.idDetailer = :idDetailer', { idDetailer })
      .getRawOne<{ live: unknown; notLive: unknown }>()
    return { live: Number(raw?.live ?? 0), notLive: Number(raw?.notLive ?? 0) }
  }

  /** Las filas de la empresa (cualquier estado) que usan la compañía o categoría. */
  findByCatalog(field: 'idCompany' | 'idCategory', idCatalog: number, idDetailer: number): Promise<Expense[]> {
    return this.find({ where: { [field]: idCatalog, idDetailer }, order: { id: 'ASC' } })
  }

  /** Pasa las filas de la empresa de una compañía o categoría a otra; devuelve cuántas cambió. */
  async reassignCatalog(field: 'idCompany' | 'idCategory', fromId: number, toId: number, idDetailer: number): Promise<number> {
    const result = await this.update({ [field]: fromId, idDetailer }, { [field]: toId })
    return Number(result.affected ?? 0)
  }
}
