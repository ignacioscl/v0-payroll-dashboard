import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { BaseRepository } from 'src/commons/repository/base.repository'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'
import { GenericDataQueryDto } from '../dto/generic-data.dto'
import { EXPENSES_COMPANY_CATEGORY, GenericData } from '../entity/generic-data.entity'

/** Una fila del catálogo con su conteo de gastos y, en compañías, su última categoría. */
export interface CatalogRow {
  item: GenericData
  expensesCount: number
  lastCategory: { id: number; name: string; active: boolean } | null
}

/**
 * Conteo de gastos activos que usan la fila: un gasto repartido cuenta una vez. `EXP_EXPENSE.id` y
 * `EXP_EXPENSE_GROUP.id` son secuencias distintas, por eso el prefijo (misma expresión `expenseIdentity` del
 * repositorio de reporte, srs/expenses/repository/expense-report.repository.ts).
 */
const EXPENSES_COUNT_SQL = (column: 'id_company' | 'id_category') =>
  `(SELECT COUNT(DISTINCT IF(e.id_exp_group IS NULL, CONCAT('e', e.id), CONCAT('g', e.id_exp_group)))
      FROM EXP_EXPENSE e WHERE e.${column} = g.id AND e.estado = 1)`

@Injectable()
export class GenericDataRepository extends BaseRepository<GenericData, GenericDataQueryDto> {
  constructor(
    @InjectRepository(GenericData)
    private readonly _: Repository<GenericData>,
  ) {
    super(_.target, _.manager, _.queryRunner)
  }

  public async fetch(payload: GenericDataQueryDto): Promise<PaginationDto<GenericData>> {
    const query = this.createQueryBuilder('g')
    if (payload.id != null) query.andWhere('g.id = :id', { id: payload.id })
    if (payload.idCategoria != null) query.andWhere('g.idCategoria = :cat', { cat: payload.idCategoria })
    if (payload.idDealerProvider != null) {
      query.andWhere('g.idDealerProvider = :prov', { prov: payload.idDealerProvider })
    }
    if (payload.estado != null) query.andWhere('g.estado = :estado', { estado: payload.estado })
    const term = payload.term?.trim()
    if (term) query.andWhere('g.name LIKE :term', { term: `%${term}%` })
    query.orderBy('g.name', 'ASC')
    return this.applyPagination(query, payload)
  }

  /** Una fila del catálogo de la empresa y la categoría paramétrica pedida, o null. */
  findOwned(id: number, idCategoria: number, idDealerProvider: number): Promise<GenericData | null> {
    return this.findOne({ where: { id, idCategoria, idDealerProvider } })
  }

  /** La fila activa con el mismo nombre (sin mayúsculas ni espacios de borde), si existe. */
  findActiveByName(
    name: string,
    idCategoria: number,
    idDealerProvider: number,
    excludeId?: number,
  ): Promise<GenericData | null> {
    const query = this.createQueryBuilder('g')
      .where('g.idCategoria = :cat', { cat: idCategoria })
      .andWhere('g.idDealerProvider = :prov', { prov: idDealerProvider })
      .andWhere('g.estado = 1')
      .andWhere('LOWER(TRIM(g.name)) = LOWER(TRIM(:name))', { name })
    if (excludeId) query.andWhere('g.id <> :excludeId', { excludeId })
    return query.orderBy('g.id', 'ASC').getOne()
  }

  /**
   * Catálogo de la empresa (34 compañías / 35 categorías) con el conteo de gastos y la última categoría de cada
   * compañía (`id_parent`, D4). `page` es base 0 acá (el controller resta 1).
   */
  async listCatalog(input: {
    idCategoria: number
    idDealerProvider: number
    activeOnly: boolean
    term?: string
    page: number
    pageSize: number
  }): Promise<{ rows: CatalogRow[]; total: number }> {
    const isCompany = input.idCategoria === EXPENSES_COMPANY_CATEGORY
    const base = this.createQueryBuilder('g')
      .where('g.idCategoria = :cat', { cat: input.idCategoria })
      .andWhere('g.idDealerProvider = :prov', { prov: input.idDealerProvider })
    if (input.activeOnly) base.andWhere('g.estado = 1')
    const term = input.term?.trim()
    if (term) base.andWhere('g.name LIKE :term', { term: `%${term}%` })

    const total = await base.clone().getCount()

    const query = base
      .clone()
      .addSelect(EXPENSES_COUNT_SQL(isCompany ? 'id_company' : 'id_category'), 'expensesCount')
      .orderBy('g.name', 'ASC')
      .addOrderBy('g.id', 'ASC')
      .offset(input.page * input.pageSize)
      .limit(input.pageSize)
    if (isCompany) {
      query
        .leftJoin(GenericData, 'p', 'p.id = g.idParent')
        .addSelect('p.id', 'lastCategoryId')
        .addSelect('p.name', 'lastCategoryName')
        .addSelect('p.estado', 'lastCategoryEstado')
    }
    const { entities, raw } = await query.getRawAndEntities()
    const rows: CatalogRow[] = entities.map((item, i) => {
      const r = raw[i] ?? {}
      const lastId = Number(r.lastCategoryId ?? 0)
      return {
        item,
        expensesCount: Number(r.expensesCount ?? 0),
        lastCategory:
          isCompany && lastId > 0
            ? { id: lastId, name: String(r.lastCategoryName ?? ''), active: Number(r.lastCategoryEstado) === 1 }
            : null,
      }
    })
    return { rows, total }
  }

  /** Conteo de gastos activos de una fila (para devolver un ítem solo). */
  async expensesCountOf(id: number, idCategoria: number): Promise<number> {
    const column = idCategoria === EXPENSES_COMPANY_CATEGORY ? 'id_company' : 'id_category'
    const rows: { c: unknown }[] = await this.manager.query(
      `SELECT COUNT(DISTINCT IF(e.id_exp_group IS NULL, CONCAT('e', e.id), CONCAT('g', e.id_exp_group))) AS c
         FROM EXP_EXPENSE e WHERE e.${column} = ? AND e.estado = 1`,
      [id],
    )
    return Number(rows[0]?.c ?? 0)
  }
}
