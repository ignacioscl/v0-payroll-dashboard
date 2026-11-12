import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { Transactional } from 'typeorm-transactional'

import { fieldError } from 'src/commons/errors/field.error'
import { catalogDuplicateKey } from 'src/srs/expenses/expense-catalog-duplicate-key'
import { expenseClosingClass } from 'src/srs/expenses/expense-closing-class'
import { SrsContext } from 'src/srs/auth/srs-auth-context.service'
import {
  ROL_ACCION_EXPENSES_ADD,
  ROL_ACCION_EXPENSES_APPROVE,
  SrsPermissionRepository,
} from 'src/srs/auth/srs-permission.repository'
import { MSG_NAME_EXISTS } from 'src/features/srs-expense/rules/expense-rules'
import {
  CatalogItemDto,
  CatalogPageDto,
  CatalogQueryDto,
  CreateCatalogItemDto,
  UpdateCatalogItemDto,
} from '../dto/generic-data.dto'
import { EXPENSES_CATEGORY_CATEGORY, EXPENSES_COMPANY_CATEGORY, GenericData } from '../entity/generic-data.entity'
import { GenericDataService } from './generic-data.service'

export type CatalogKind = 'company' | 'category'

export const CATALOG_PAGE_SIZE_DEFAULT = 25
export const CATALOG_PAGE_SIZE_MAX = 200

/**
 * Expenses › Settings y las altas al vuelo de Add Expense: las dos vistas de GENERIC_DATA (34 compañías, 35
 * categorías) de la empresa de la sesión. T2.1 del plan. Mismo feature que la tabla.
 */
@Injectable()
export class ExpenseCatalogService {
  constructor(
    @Inject(GenericDataService) private readonly generic: GenericDataService,
    @Inject(SrsPermissionRepository) private readonly permissions: SrsPermissionRepository,
  ) {}

  static idCategoriaOf(kind: CatalogKind): number {
    return kind === 'company' ? EXPENSES_COMPANY_CATEGORY : EXPENSES_CATEGORY_CATEGORY
  }

  /** 110 o 111 (Add Expense crea al vuelo; Settings administra). */
  private async assertCanCreate(ctx: SrsContext): Promise<void> {
    if (await this.permissions.userHasRolAccion(ctx, ROL_ACCION_EXPENSES_ADD)) return
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
  }

  async list(ctx: SrsContext, kind: CatalogKind, query: CatalogQueryDto): Promise<CatalogPageDto> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
    const modes = [query.activeOnly, query.inactiveOnly, query.duplicatesOnly].filter((v) => v === '1').length
    if (modes > 1) {
      throw new BadRequestException('Use only one of activeOnly, inactiveOnly or duplicatesOnly.')
    }
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(CATALOG_PAGE_SIZE_MAX, Math.max(1, query.pageSize ?? CATALOG_PAGE_SIZE_DEFAULT))
    if (query.duplicatesOnly === '1') return this.listDuplicates(ctx, kind, query.term, page, pageSize)
    const { rows, total } = await this.generic.listCatalog({
      idCategoria: ExpenseCatalogService.idCategoriaOf(kind),
      idDealerProvider: ctx.idDealerProvider,
      activeOnly: query.activeOnly === '1',
      inactiveOnly: query.inactiveOnly === '1',
      term: query.term,
      page: page - 1,
      pageSize,
    })
    return {
      data: rows.map((r) => this.toItem(kind, r.item, r.expensesCount, r.inUse, r.lastCategory)),
      total,
      page,
      pageSize,
    }
  }

  /**
   * «Possible duplicates» (plans/plan-expenses-posibles-duplicados, T2): solo las filas de la empresa de la sesión
   * cuyo nombre comparte la clave de `catalogDuplicateKey` con otra fila de la misma solapa, activas e inactivas.
   * Orden: por clave, activas primero, más gastos primero y por id; se pagina en memoria (son pocas). `groups` cuenta
   * los grupos que quedan después del buscador.
   */
  private async listDuplicates(
    ctx: SrsContext,
    kind: CatalogKind,
    term: string | undefined,
    page: number,
    pageSize: number,
  ): Promise<CatalogPageDto> {
    const idCategoria = ExpenseCatalogService.idCategoriaOf(kind)
    const keyById = new Map<number, string>()
    const sizeByKey = new Map<string, number>()
    for (const row of await this.generic.catalogNames(idCategoria, ctx.idDealerProvider)) {
      const key = catalogDuplicateKey(row.name)
      if (!key) continue
      keyById.set(row.id, key)
      sizeByKey.set(key, (sizeByKey.get(key) ?? 0) + 1)
    }
    const ids = [...keyById].filter(([, key]) => (sizeByKey.get(key) ?? 0) > 1).map(([id]) => id)
    const { rows } = await this.generic.listCatalog({
      idCategoria,
      idDealerProvider: ctx.idDealerProvider,
      activeOnly: false,
      ids,
      term,
      page: 0,
      pageSize: null,
    })
    const keyOf = (r: (typeof rows)[number]) => keyById.get(r.item.id) ?? ''
    rows.sort((a, b) => {
      const ka = keyOf(a)
      const kb = keyOf(b)
      if (ka !== kb) return ka < kb ? -1 : 1
      const activeA = Number(a.item.estado) === 1 ? 0 : 1
      const activeB = Number(b.item.estado) === 1 ? 0 : 1
      if (activeA !== activeB) return activeA - activeB
      if (a.expensesCount !== b.expensesCount) return b.expensesCount - a.expensesCount
      return a.item.id - b.item.id
    })
    const groupOfKey = new Map<string, number>()
    for (const r of rows) if (!groupOfKey.has(keyOf(r))) groupOfKey.set(keyOf(r), groupOfKey.size)
    const data = rows.slice((page - 1) * pageSize, page * pageSize).map((r) => ({
      ...this.toItem(kind, r.item, r.expensesCount, r.inUse, r.lastCategory),
      duplicateGroup: groupOfKey.get(keyOf(r)) ?? 0,
    }))
    return { data, total: rows.length, page, pageSize, groups: groupOfKey.size }
  }

  /**
   * Alta: busca el nombre (LOWER(TRIM(name)), misma empresa y categoría). Activa → la devuelve con `existing: true`;
   * solo inactiva → la reactiva y la devuelve con `existing: true, reactivated: true` (D3 de plan-expenses-settings);
   * ninguna → inserta (sin ON DUPLICATE KEY: regla sql-no-insert-upsert).
   */
  @Transactional()
  async create(ctx: SrsContext, kind: CatalogKind, body: CreateCatalogItemDto) {
    await this.assertCanCreate(ctx)
    const { item, existing, reactivated } = await this.findOrCreate(ctx, kind, body.name)
    const dto = await this.itemWithCounts(kind, item)
    return { ...dto, existing, reactivated }
  }

  /** La misma búsqueda-o-alta, para Add Expense y la regla (sin verificar permiso: lo hace quien llama). */
  async findOrCreate(
    ctx: SrsContext,
    kind: CatalogKind,
    rawName: string,
  ): Promise<{ item: GenericData; existing: boolean; reactivated: boolean }> {
    const name = String(rawName ?? '').trim()
    const idCategoria = ExpenseCatalogService.idCategoriaOf(kind)
    const found = await this.generic.findByNameActiveFirst(name, idCategoria, ctx.idDealerProvider)
    if (found && Number(found.estado) === 1) return { item: found, existing: true, reactivated: false }
    if (found) {
      await this.generic.updateById(found.id, { estado: 1 })
      found.estado = 1
      return { item: found, existing: true, reactivated: true }
    }
    const created = await this.generic.create({
      idCategoria,
      idDealerProvider: ctx.idDealerProvider,
      idUsuario: ctx.idUsuario,
      name,
      type: 1,
      estado: 1,
    })
    return { item: created, existing: false, reactivated: false }
  }

  @Transactional()
  async update(ctx: SrsContext, kind: CatalogKind, id: number, body: UpdateCatalogItemDto) {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
    const item = await this.requireOwned(ctx, kind, id)
    const patch: Partial<GenericData> = {}
    if (body.name !== undefined && body.name.trim() !== item.name) {
      const dup = await this.generic.findActiveByName(
        body.name,
        ExpenseCatalogService.idCategoriaOf(kind),
        ctx.idDealerProvider,
        id,
      )
      if (dup) throw fieldError('name', MSG_NAME_EXISTS)
      patch.name = body.name.trim()
    }
    if (body.active !== undefined) {
      const estado = body.active ? 1 : 0
      if (estado === 1 && item.estado !== 1) {
        // Reactivar no puede dejar dos activas con el mismo nombre.
        const dup = await this.generic.findActiveByName(
          patch.name ?? item.name,
          ExpenseCatalogService.idCategoriaOf(kind),
          ctx.idDealerProvider,
          id,
        )
        if (dup) throw fieldError('name', MSG_NAME_EXISTS)
      }
      patch.estado = estado
    }
    if (Object.keys(patch).length) await this.generic.updateById(id, patch)
    return this.itemWithCounts(kind, Object.assign(item, patch))
  }

  /** Una fila de la empresa y de la categoría pedida; de otra empresa → 404. */
  async requireOwned(ctx: SrsContext, kind: CatalogKind, id: number): Promise<GenericData> {
    const item = await this.generic.findOwned(id, ExpenseCatalogService.idCategoriaOf(kind), ctx.idDealerProvider)
    if (!item) throw new NotFoundException(kind === 'company' ? 'Company not found' : 'Category not found')
    return item
  }

  /** D4: la compañía queda con la categoría del gasto recién grabado (solo si cambia). */
  async setLastCategory(ctx: SrsContext, idCompany: number, idCategory: number): Promise<void> {
    const company = await this.generic.findOwned(idCompany, EXPENSES_COMPANY_CATEGORY, ctx.idDealerProvider)
    if (!company || Number(company.idParent) === Number(idCategory)) return
    await this.generic.updateById(idCompany, { idParent: idCategory })
  }

  /** El ítem con sus conteos, como lo devuelve el listado (también lo usa el Merge para la fila que queda). */
  async itemWithCounts(kind: CatalogKind, item: GenericData): Promise<CatalogItemDto> {
    const idCategoria = ExpenseCatalogService.idCategoriaOf(kind)
    const count = await this.generic.expensesCountOf(item.id, idCategoria)
    const inUse = await this.generic.inUseOf(item.id, idCategoria)
    let last: CatalogItemDto['lastCategory'] = null
    if (kind === 'company' && item.idParent) {
      const parent = await this.generic.findOwned(item.idParent, EXPENSES_CATEGORY_CATEGORY, item.idDealerProvider ?? 0)
      if (parent) last = { id: parent.id, name: parent.name, active: parent.estado === 1 }
    }
    return this.toItem(kind, item, count, inUse, last)
  }

  private toItem(
    kind: CatalogKind,
    item: GenericData,
    expensesCount: number,
    inUse: boolean,
    lastCategory: CatalogItemDto['lastCategory'],
  ): CatalogItemDto {
    const dto: CatalogItemDto = {
      id: item.id,
      name: item.name,
      active: Number(item.estado) === 1,
      expensesCount,
      deletable: !inUse,
    }
    if (kind === 'company') dto.lastCategory = lastCategory ?? null
    else dto.closingClass = expenseClosingClass(item.name)
    return dto
  }
}
