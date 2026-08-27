import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'

import { SrsContext } from '../../auth/srs-auth-context.service'
import {
  ROL_ACCION_GENERIC_SERVICE_DELETE,
  ROL_ACCION_INVOICE_CREATE,
  ROL_ACCION_INVOICES_MODULE_ACCESS,
  SrsPermissionRepository,
} from '../../auth/srs-permission.repository'
import { skipDealerRestrictionForRol } from '../../shared/kpi/srs-kpi-dealer-filter'
import {
  CreateGenericInvoiceDto,
  CreateGenericInvoiceResponseDto,
  GenericCatalogItemDto,
  GenericFreeItemDto,
  GenericInvoiceConfigDto,
  GenericInvoiceDetailDto,
  GenericTtkEmployeesQueryDto,
  GenericTtkEmployeesResponseDto,
  GenericTtkItemDto,
  UpdateGenericInvoiceDto,
  UpdateGenericInvoiceResponseDto,
} from '../dto/generic-invoice.dto'
import { GenericInvoiceConflictError } from '../generic-invoice-conflict.error'
import { conflictFromMysql, isDupEntry } from '../generic-invoice-write-errors'
import {
  PersistLine,
  GenericInvoiceRepository,
  TtkPunchRow,
} from '../repository/generic-invoice.repository'

const TYPE_COMPANY = 1
const SEL_REL_MAX = 9000

function isTtkItem(
  item: GenericFreeItemDto | GenericTtkItemDto,
): item is GenericTtkItemDto {
  return item.kind === 'ttk'
}

function isFreeItem(
  item: GenericFreeItemDto | GenericTtkItemDto,
): item is GenericFreeItemDto {
  return item.kind !== 'ttk'
}

@Injectable()
export class GenericInvoiceService {
  private readonly logger = new Logger(GenericInvoiceService.name)

  constructor(
    private readonly repository: GenericInvoiceRepository,
    private readonly permissions: SrsPermissionRepository,
  ) {}

  async config(ctx: SrsContext): Promise<GenericInvoiceConfigDto> {
    const gates = await this.repository.loadCompanyGates(ctx.idDealerProvider)
    const hasGenericInvoice = Boolean(gates?.hasGenericInvoice)
    const isCompanyType = Number(gates?.typeEfectivo) === TYPE_COMPANY
    const hasModule = await this.permissions.userHasRolAccion(
      ctx,
      ROL_ACCION_INVOICES_MODULE_ACCESS,
    )
    const hasCreate = await this.permissions.userHasRolAccion(ctx, ROL_ACCION_INVOICE_CREATE)
    const canDeleteCatalogItem = await this.permissions.userHasRolAccion(
      ctx,
      ROL_ACCION_GENERIC_SERVICE_DELETE,
    )
    return {
      hasGenericInvoice,
      canCreate: hasGenericInvoice && !isCompanyType && hasModule && hasCreate,
      canDeleteCatalogItem,
    }
  }

  async listCatalog(
    ctx: SrsContext,
    cat: 36 | 44,
    idDealer: number,
    q?: string,
  ): Promise<GenericCatalogItemDto[]> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_INVOICES_MODULE_ACCESS)
    await this.assertDealerInScope(ctx, idDealer)
    return this.repository.listCatalog(cat, idDealer, ctx.idDealerProvider, q)
  }

  async deleteCatalogItem(ctx: SrsContext, id: number): Promise<void> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_GENERIC_SERVICE_DELETE)
    const affected = await this.repository.softDeleteCatalogItem(id, ctx.idDealerProvider)
    if (affected < 1) {
      throw new NotFoundException('Catalog item not found')
    }
  }

  async listTtkEmployees(
    ctx: SrsContext,
    query: GenericTtkEmployeesQueryDto,
  ): Promise<GenericTtkEmployeesResponseDto> {
    await this.assertCanWriteGeneric(ctx)
    await this.assertDealerInScope(ctx, query.idDealer)
    if (query.dateTo < query.dateFrom) {
      throw new BadRequestException('End date cannot be earlier than start date.')
    }
    if (query.includeStatementId != null) {
      const header = await this.repository.loadGenericHeader(
        query.includeStatementId,
        ctx.idDealerProvider,
      )
      if (!header || header.idDealer !== query.idDealer) {
        throw new NotFoundException('Invoice not found')
      }
    }
    return this.repository.listTtkEmployees({
      idDealer: query.idDealer,
      idDealerProvider: ctx.idDealerProvider,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      includeStatementId: query.includeStatementId,
    })
  }

  async getById(ctx: SrsContext, id: number): Promise<GenericInvoiceDetailDto> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_INVOICES_MODULE_ACCESS)
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_INVOICE_CREATE)
    const detail = await this.repository.loadGenericDetail(id, ctx.idDealerProvider)
    if (!detail) {
      throw new NotFoundException('Invoice not found')
    }
    await this.assertCompanyCanCreate(ctx)
    await this.assertDealerInScope(ctx, detail.idDealer)
    return detail
  }

  async create(
    ctx: SrsContext,
    dto: CreateGenericInvoiceDto,
    rawBody?: unknown,
  ): Promise<CreateGenericInvoiceResponseDto> {
    this.rejectTtkFreeFields(rawBody)
    await this.assertCanWriteGeneric(ctx)
    await this.assertDealerInScope(ctx, dto.idDealer)

    if (dto.dateTo < dto.dateFrom) {
      throw new BadRequestException('End date cannot be earlier than start date.')
    }
    this.assertNoDuplicateDescriptions(dto.items)
    this.assertNoDuplicateEmployees(dto.items)

    const ttkItems = dto.items.filter(isTtkItem)
    const punchesByEmployee = await this.resolveTtkPunches(ctx, {
      idDealer: dto.idDealer,
      dateFrom: dto.dateFrom,
      dateTo: dto.dateTo,
      employees: ttkItems,
    })
    const names = await this.repository.loadEmployeeNames(
      dto.idDealer,
      ttkItems.map((item) => item.idEmployee),
    )
    const selRel = this.buildSelRel(dto.items, names)
    if (selRel.length > SEL_REL_MAX) {
      throw new BadRequestException('The concatenated item descriptions exceed 9000 characters.')
    }

    const freeze = await this.repository.checkDateFreeze(
      ctx.idUsuario,
      dto.idDealer,
      ctx.idDealerProvider,
      dto.dateFrom,
    )
    if (freeze === 0) {
      throw new BadRequestException('The billing has been blocked')
    }

    const cambios = await this.upsertCatalogBestEffort(ctx, dto.idDealer, dto.items, dto.headerNote)

    const persistItems = this.toPersistLines(dto.items, punchesByEmployee)
    try {
      const created = await this.persistStatement(ctx, dto, selRel, persistItems)
      await this.logCatalogChangesBestEffort(created.id, ctx.idUsuario, cambios)
      return created
    } catch (err) {
      if (!isDupEntry(err)) throw err
      const created = await this.persistStatement(ctx, dto, selRel, persistItems)
      await this.logCatalogChangesBestEffort(created.id, ctx.idUsuario, cambios)
      return created
    }
  }

  async update(
    ctx: SrsContext,
    id: number,
    dto: UpdateGenericInvoiceDto,
    rawBody?: unknown,
  ): Promise<UpdateGenericInvoiceResponseDto> {
    this.rejectIdDealer(rawBody)
    this.rejectTtkFreeFields(rawBody)
    await this.assertCanWriteGeneric(ctx)

    const header = await this.repository.loadGenericHeader(id, ctx.idDealerProvider)
    if (!header) {
      throw new NotFoundException('Invoice not found')
    }
    await this.assertDealerInScope(ctx, header.idDealer)

    if (dto.dateTo < dto.dateFrom) {
      throw new BadRequestException('End date cannot be earlier than start date.')
    }
    this.assertNoDuplicateDescriptions(dto.items)
    this.assertNoDuplicateEmployees(dto.items)

    const freezeStored = await this.repository.checkDateFreeze(
      ctx.idUsuario,
      header.idDealer,
      ctx.idDealerProvider,
      header.dateFrom,
    )
    const freezeNew = await this.repository.checkDateFreeze(
      ctx.idUsuario,
      header.idDealer,
      ctx.idDealerProvider,
      dto.dateFrom,
    )
    if (freezeStored === 0 || freezeNew === 0) {
      throw new BadRequestException('The billing has been blocked')
    }

    const ttkItems = dto.items.filter(isTtkItem)
    const punchesByEmployee = await this.resolveTtkPunches(ctx, {
      idDealer: header.idDealer,
      dateFrom: dto.dateFrom,
      dateTo: dto.dateTo,
      employees: ttkItems,
      includeStatementId: id,
      allowMissing: true,
    })

    try {
      const updated = await this.repository.updateGenericInvoice({
        idStatement: id,
        idDealerProvider: ctx.idDealerProvider,
        idAuthor: ctx.idUsuario,
        dateFrom: dto.dateFrom,
        dateTo: dto.dateTo,
        invoiceNote: dto.invoiceNote ?? null,
        headerNote: dto.headerNote ?? null,
        tax: dto.tax == null || dto.tax === 0 ? null : dto.tax,
        freeItems: dto.items.filter(isFreeItem).map((item) => ({
          idRel: item.idRel,
          description: item.description,
          qty: item.qty ?? null,
          unitAmount: item.unitAmount,
        })),
        ttkItems: ttkItems.map((item) => ({
          idEmployee: item.idEmployee,
          onlyTimecard: Boolean(item.onlyTimecard),
        })),
        punchesByEmployee,
      })
      await this.upsertCatalogAfterEdit(
        ctx,
        header.idDealer,
        updated.catalogUpserts,
        dto.headerNote,
        updated.id,
      )
      return { id: updated.id, fullNro: updated.fullNro }
    } catch (err) {
      const conflict = conflictFromMysql(err)
      if (conflict) throw conflict
      throw err
    }
  }

  private async persistStatement(
    ctx: SrsContext,
    dto: CreateGenericInvoiceDto,
    selRel: string,
    items: PersistLine[],
  ): Promise<CreateGenericInvoiceResponseDto> {
    return this.repository.createStatement({
      idDealer: dto.idDealer,
      idDealerProvider: ctx.idDealerProvider,
      idAuthor: ctx.idUsuario,
      dateFrom: dto.dateFrom,
      dateTo: dto.dateTo,
      invoiceNote: dto.invoiceNote ?? null,
      headerNote: dto.headerNote ?? null,
      tax: dto.tax == null || dto.tax === 0 ? null : dto.tax,
      selRel,
      items,
    })
  }

  private async assertCanWriteGeneric(ctx: SrsContext): Promise<void> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_INVOICES_MODULE_ACCESS)
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_INVOICE_CREATE)
    await this.assertCompanyCanCreate(ctx)
  }

  private async assertCompanyCanCreate(ctx: SrsContext): Promise<void> {
    const gates = await this.repository.loadCompanyGates(ctx.idDealerProvider)
    if (!gates?.hasGenericInvoice || Number(gates.typeEfectivo) === TYPE_COMPANY) {
      throw new ForbiddenException('Forbidden')
    }
  }

  private async assertDealerInScope(ctx: SrsContext, idDealer: number): Promise<void> {
    const exists = await this.repository.dealerRelExists(idDealer, ctx.idDealerProvider)
    if (!exists) {
      throw new ForbiddenException('Forbidden')
    }
    if (skipDealerRestrictionForRol(ctx.idRol)) return
    const allowed = await this.repository.restrictionDealerAllows(ctx.idUsuario, idDealer)
    if (!allowed) {
      throw new ForbiddenException('Forbidden')
    }
  }

  private assertNoDuplicateDescriptions(
    items: Array<GenericFreeItemDto | GenericTtkItemDto>,
  ): void {
    const seen = new Set<string>()
    for (const item of items) {
      if (!isFreeItem(item)) continue
      const key = item.description.toLowerCase()
      if (seen.has(key)) {
        throw new BadRequestException('Item already exists')
      }
      seen.add(key)
    }
  }

  private assertNoDuplicateEmployees(
    items: Array<GenericFreeItemDto | GenericTtkItemDto>,
  ): void {
    const seen = new Set<number>()
    for (const item of items) {
      if (!isTtkItem(item)) continue
      if (seen.has(item.idEmployee)) {
        throw new BadRequestException('Duplicate TTK employee.')
      }
      seen.add(item.idEmployee)
    }
  }

  private rejectIdDealer(rawBody: unknown): void {
    if (rawBody && typeof rawBody === 'object' && 'idDealer' in rawBody) {
      const value = (rawBody as { idDealer?: unknown }).idDealer
      if (value != null && value !== '') {
        throw new BadRequestException('idDealer cannot be changed.')
      }
    }
  }

  private rejectTtkFreeFields(rawBody: unknown): void {
    if (!rawBody || typeof rawBody !== 'object') return
    const items = (rawBody as { items?: unknown }).items
    if (!Array.isArray(items)) return
    for (const item of items) {
      if (!item || typeof item !== 'object') continue
      if ((item as { kind?: unknown }).kind !== 'ttk') continue
      if (
        'unitAmount' in item ||
        'description' in item ||
        'qty' in item ||
        'idRel' in item
      ) {
        throw new BadRequestException('TTK items cannot include unitAmount, description, or qty.')
      }
    }
  }

  private async resolveTtkPunches(
    ctx: SrsContext,
    args: {
      idDealer: number
      dateFrom: string
      dateTo: string
      employees: GenericTtkItemDto[]
      includeStatementId?: number
      allowMissing?: boolean
    },
  ): Promise<Map<number, TtkPunchRow[]>> {
    const map = new Map<number, TtkPunchRow[]>()
    if (args.employees.length === 0) return map
    const punches = await this.repository.listTtkPunches({
      idDealer: args.idDealer,
      idDealerProvider: ctx.idDealerProvider,
      dateFrom: args.dateFrom,
      dateTo: args.dateTo,
      includeStatementId: args.includeStatementId,
      idEmployees: args.employees.map((e) => e.idEmployee),
    })
    for (const punch of punches) {
      const list = map.get(punch.idEmployee) ?? []
      list.push(punch)
      map.set(punch.idEmployee, list)
    }
    for (const employee of args.employees) {
      const rows = map.get(employee.idEmployee) ?? []
      if (rows.length === 0 && !args.allowMissing) {
        throw new GenericInvoiceConflictError(
          'EMPLOYEE_NO_ROWS',
          'Selected employee has no billable time in this period.',
          { idEmployee: employee.idEmployee },
        )
      }
    }
    return map
  }

  private toPersistLines(
    items: Array<GenericFreeItemDto | GenericTtkItemDto>,
    punchesByEmployee: Map<number, TtkPunchRow[]>,
  ): PersistLine[] {
    const lines: PersistLine[] = []
    for (const item of items) {
      if (isTtkItem(item)) {
        const punches = punchesByEmployee.get(item.idEmployee) ?? []
        for (const punch of punches) {
          lines.push({
            kind: 'ttk',
            idEmployeeWork: punch.idEmployeeWork,
            amount: punch.amount,
            onlyTimecard: Boolean(item.onlyTimecard),
          })
        }
        continue
      }
      lines.push({
        kind: 'free',
        description: item.description,
        qty: item.qty ?? null,
        unitAmount: item.unitAmount,
      })
    }
    return lines
  }

  private buildSelRel(
    items: Array<GenericFreeItemDto | GenericTtkItemDto>,
    names: Map<number, { nombre: string; rolName: string | null; dptoName: string | null }>,
  ): string {
    return items
      .map((item) => {
        if (isTtkItem(item)) return names.get(item.idEmployee)?.nombre ?? ''
        return item.description
      })
      .join(', ')
  }

  private async upsertCatalogBestEffort(
    ctx: SrsContext,
    idDealer: number,
    items: Array<GenericFreeItemDto | GenericTtkItemDto>,
    headerNote?: string,
  ): Promise<Array<{ name: string; idDealer: number; priceOld: number | null; priceNew: number }>> {
    const cambios: Array<{
      name: string
      idDealer: number
      priceOld: number | null
      priceNew: number
    }> = []
    for (const item of items) {
      if (!isFreeItem(item)) continue
      try {
        const change = await this.repository.upsertCatalogItem(
          ctx.idDealerProvider,
          idDealer,
          ctx.idUsuario,
          item.description,
          item.unitAmount,
        )
        if (change) cambios.push(change)
      } catch (err) {
        this.logCatalogUpsertError(`item "${item.description}"`, err)
      }
    }
    const header = headerNote?.trim() ?? ''
    if (header) {
      try {
        await this.repository.upsertCatalogHeaderNote(
          ctx.idDealerProvider,
          idDealer,
          ctx.idUsuario,
          header,
        )
      } catch (err) {
        this.logCatalogUpsertError('header note', err)
      }
    }
    return cambios
  }

  private async upsertCatalogAfterEdit(
    ctx: SrsContext,
    idDealer: number,
    upserts: Array<{ name: string; price: number }>,
    headerNote: string | undefined,
    idStatement: number,
  ): Promise<void> {
    const cambios: Array<{
      name: string
      idDealer: number
      priceOld: number | null
      priceNew: number
    }> = []
    for (const item of upserts) {
      try {
        const change = await this.repository.upsertCatalogItem(
          ctx.idDealerProvider,
          idDealer,
          ctx.idUsuario,
          item.name,
          item.price,
        )
        if (change) cambios.push(change)
      } catch (err) {
        this.logCatalogUpsertError(`item "${item.name}"`, err)
      }
    }
    const header = headerNote?.trim() ?? ''
    if (header) {
      try {
        await this.repository.upsertCatalogHeaderNote(
          ctx.idDealerProvider,
          idDealer,
          ctx.idUsuario,
          header,
        )
      } catch (err) {
        this.logCatalogUpsertError('header note', err)
      }
    }
    await this.logCatalogChangesBestEffort(idStatement, ctx.idUsuario, cambios)
  }

  private async logCatalogChangesBestEffort(
    idStatement: number,
    idUsuario: number,
    cambios: Array<{ name: string; idDealer: number; priceOld: number | null; priceNew: number }>,
  ): Promise<void> {
    if (cambios.length === 0) return
    try {
      await this.repository.logCatalogPriceChanges(idStatement, idUsuario, cambios)
    } catch (err) {
      this.logCatalogUpsertError('catalog price log', err)
    }
  }

  private logCatalogUpsertError(what: string, err: unknown): void {
    this.logger.error(
      `Generic invoice catalog upsert failed (${what}); continuing with statement create`,
      err instanceof Error ? err.stack : String(err),
    )
  }
}
