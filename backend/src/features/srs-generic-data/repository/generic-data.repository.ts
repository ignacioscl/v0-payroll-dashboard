import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { BaseRepository } from 'src/commons/repository/base.repository'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'
import { CatalogColumn, catalogInUseSql, expensesCountSql } from 'src/srs/expenses/expense-catalog-usage.sql'
import { GenericDataQueryDto } from '../dto/generic-data.dto'
import { EXPENSES_COMPANY_CATEGORY, GenericData } from '../entity/generic-data.entity'

/** Una fila del catálogo con su conteo de gastos, si algo la usa y, en compañías, su última categoría. */
export interface CatalogRow {
  item: GenericData
  expensesCount: number
  inUse: boolean
  lastCategory: { id: number; name: string; active: boolean } | null
}

const columnOf = (idCategoria: number): CatalogColumn =>
  idCategoria === EXPENSES_COMPANY_CATEGORY ? 'id_company' : 'id_category'

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
   * Para el alta (D3 de plan-expenses-settings): la activa más vieja con ese nombre o, si no hay, la inactiva más
   * vieja (sin mayúsculas ni espacios de borde).
   */
  findByNameActiveFirst(name: string, idCategoria: number, idDealerProvider: number): Promise<GenericData | null> {
    return this.createQueryBuilder('g')
      .where('g.idCategoria = :cat', { cat: idCategoria })
      .andWhere('g.idDealerProvider = :prov', { prov: idDealerProvider })
      .andWhere('LOWER(TRIM(g.name)) = LOWER(TRIM(:name))', { name })
      .orderBy('g.estado', 'DESC')
      .addOrderBy('g.id', 'ASC')
      .getOne()
  }

  /** Borra la fila de la empresa y la categoría paramétrica pedida; devuelve cuántas borró (0 o 1). */
  async deleteOwned(id: number, idCategoria: number, idDealerProvider: number): Promise<number> {
    const result = await this.delete({ id, idCategoria, idDealerProvider })
    return Number(result.affected ?? 0)
  }

  /** Las filas de la empresa y la categoría paramétrica `idCategoria` que tienen a `fromId` de `id_parent`. */
  childrenOf(fromId: number, idCategoria: number, idDealerProvider: number): Promise<GenericData[]> {
    return this.find({ where: { idParent: fromId, idCategoria, idDealerProvider }, order: { id: 'ASC' } })
  }

  /** `id_parent` de `fromId` a `toId`, solo en filas de la empresa y la categoría paramétrica pedida. */
  async reassignParent(fromId: number, toId: number, idCategoria: number, idDealerProvider: number): Promise<number> {
    const result = await this.update({ idParent: fromId, idCategoria, idDealerProvider }, { idParent: toId })
    return Number(result.affected ?? 0)
  }

  /** Si algo apunta a la fila (gastos, reglas o una fila hija), con el mismo criterio del listado. */
  async inUseOf(id: number, idCategoria: number): Promise<boolean> {
    const raw = await this.createQueryBuilder('g')
      .select(catalogInUseSql(columnOf(idCategoria)), 'inUse')
      .where('g.id = :id', { id })
      .getRawOne<{ inUse: unknown }>()
    return Number(raw?.inUse ?? 0) === 1
  }

  /**
   * Catálogo de la empresa (34 compañías / 35 categorías) con el conteo de gastos y la última categoría de cada
   * compañía (`id_parent`, D4). `page` es base 0 acá (el controller resta 1).
   */
  async listCatalog(input: {
    idCategoria: number
    idDealerProvider: number
    activeOnly: boolean
    /** Solo las inactivas (switch «Show inactive» de Settings). */
    inactiveOnly?: boolean
    /** Solo estas filas (switch «Possible duplicates»); siempre dentro de la empresa y la categoría paramétrica. */
    ids?: number[]
    term?: string
    page: number
    /** null = todas, sin paginar (el modo duplicados pagina en memoria). */
    pageSize: number | null
  }): Promise<{ rows: CatalogRow[]; total: number }> {
    if (input.ids && input.ids.length === 0) return { rows: [], total: 0 }
    const isCompany = input.idCategoria === EXPENSES_COMPANY_CATEGORY
    const column = columnOf(input.idCategoria)
    const base = this.createQueryBuilder('g')
      .where('g.idCategoria = :cat', { cat: input.idCategoria })
      .andWhere('g.idDealerProvider = :prov', { prov: input.idDealerProvider })
    if (input.activeOnly) base.andWhere('g.estado = 1')
    else if (input.inactiveOnly) base.andWhere('g.estado = 0')
    if (input.ids) base.andWhere('g.id IN (:...ids)', { ids: input.ids })
    const term = input.term?.trim()
    if (term) base.andWhere('g.name LIKE :term', { term: `%${term}%` })

    const total = await base.clone().getCount()

    const query = base
      .clone()
      .addSelect(expensesCountSql(column), 'expensesCount')
      .addSelect(catalogInUseSql(column), 'inUse')
      .orderBy('g.name', 'ASC')
      .addOrderBy('g.id', 'ASC')
    if (input.pageSize != null) query.offset(input.page * input.pageSize).limit(input.pageSize)
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
        inUse: Number(r.inUse ?? 0) === 1,
        lastCategory:
          isCompany && lastId > 0
            ? { id: lastId, name: String(r.lastCategoryName ?? ''), active: Number(r.lastCategoryEstado) === 1 }
            : null,
      }
    })
    return { rows, total }
  }

  /** id y nombre de todas las filas de la empresa y la categoría paramétrica (para armar los posibles duplicados). */
  catalogNames(idCategoria: number, idDealerProvider: number): Promise<Pick<GenericData, 'id' | 'name'>[]> {
    return this.createQueryBuilder('g')
      .select(['g.id', 'g.name'])
      .where('g.idCategoria = :cat', { cat: idCategoria })
      .andWhere('g.idDealerProvider = :prov', { prov: idDealerProvider })
      .getMany()
  }

  /** Conteo de gastos activos de una fila (para devolver un ítem solo). */
  async expensesCountOf(id: number, idCategoria: number): Promise<number> {
    const raw = await this.createQueryBuilder('g')
      .select(expensesCountSql(columnOf(idCategoria)), 'c')
      .where('g.id = :id', { id })
      .getRawOne<{ c: unknown }>()
    return Number(raw?.c ?? 0)
  }
}
