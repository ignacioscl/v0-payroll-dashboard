import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { Transactional } from 'typeorm-transactional'

import { fieldError } from 'src/commons/errors/field.error'
import { SrsContext } from 'src/srs/auth/srs-auth-context.service'
import {
  ROL_ACCION_EXPENSES_ADD,
  ROL_ACCION_EXPENSES_APPROVE,
  SrsPermissionRepository,
} from 'src/srs/auth/srs-permission.repository'
import { MSG_NAME_EXISTS } from 'src/features/srs-expense/rules/expense-rules'
import { CatalogItemDto, CatalogQueryDto, CreateCatalogItemDto, UpdateCatalogItemDto } from '../dto/generic-data.dto'
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

  async list(ctx: SrsContext, kind: CatalogKind, query: CatalogQueryDto) {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(CATALOG_PAGE_SIZE_MAX, Math.max(1, query.pageSize ?? CATALOG_PAGE_SIZE_DEFAULT))
    const { rows, total } = await this.generic.listCatalog({
      idCategoria: ExpenseCatalogService.idCategoriaOf(kind),
      idDealerProvider: ctx.idDealerProvider,
      activeOnly: query.activeOnly === '1',
      term: query.term,
      page: page - 1,
      pageSize,
    })
    return {
      data: rows.map((r) => this.toItem(kind, r.item, r.expensesCount, r.lastCategory)),
      total,
      page,
      pageSize,
    }
  }

  /**
   * Alta: busca el nombre existente activo (LOWER(TRIM(name)), misma empresa y categoría); si existe lo devuelve
   * con `existing: true`, si no inserta (sin ON DUPLICATE KEY: regla sql-no-insert-upsert).
   */
  @Transactional()
  async create(ctx: SrsContext, kind: CatalogKind, body: CreateCatalogItemDto) {
    await this.assertCanCreate(ctx)
    const { item, existing } = await this.findOrCreate(ctx, kind, body.name)
    const dto = await this.itemWithCounts(kind, item)
    return { ...dto, existing }
  }

  /** La misma búsqueda-o-alta, para Add Expense y la regla (sin verificar permiso: lo hace quien llama). */
  async findOrCreate(
    ctx: SrsContext,
    kind: CatalogKind,
    rawName: string,
  ): Promise<{ item: GenericData; existing: boolean }> {
    const name = String(rawName ?? '').trim()
    const idCategoria = ExpenseCatalogService.idCategoriaOf(kind)
    const found = await this.generic.findActiveByName(name, idCategoria, ctx.idDealerProvider)
    if (found) return { item: found, existing: true }
    const created = await this.generic.create({
      idCategoria,
      idDealerProvider: ctx.idDealerProvider,
      idUsuario: ctx.idUsuario,
      name,
      type: 1,
      estado: 1,
    })
    return { item: created, existing: false }
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

  private async itemWithCounts(kind: CatalogKind, item: GenericData): Promise<CatalogItemDto> {
    const idCategoria = ExpenseCatalogService.idCategoriaOf(kind)
    const count = await this.generic.expensesCountOf(item.id, idCategoria)
    let last: CatalogItemDto['lastCategory'] = null
    if (kind === 'company' && item.idParent) {
      const parent = await this.generic.findOwned(item.idParent, EXPENSES_CATEGORY_CATEGORY, item.idDealerProvider ?? 0)
      if (parent) last = { id: parent.id, name: parent.name, active: parent.estado === 1 }
    }
    return this.toItem(kind, item, count, last)
  }

  private toItem(
    kind: CatalogKind,
    item: GenericData,
    expensesCount: number,
    lastCategory: CatalogItemDto['lastCategory'],
  ): CatalogItemDto {
    const dto: CatalogItemDto = {
      id: item.id,
      name: item.name,
      active: Number(item.estado) === 1,
      expensesCount,
    }
    if (kind === 'company') dto.lastCategory = lastCategory ?? null
    return dto
  }
}
