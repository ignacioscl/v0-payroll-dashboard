import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { QueryFailedError } from 'typeorm'

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
  GenericInvoiceConfigDto,
} from '../dto/generic-invoice.dto'
import { GenericInvoiceRepository } from '../repository/generic-invoice.repository'

const TYPE_COMPANY = 1
const SEL_REL_MAX = 9000

function isDupEntry(err: unknown): boolean {
  if (!(err instanceof QueryFailedError)) return false
  const driver = err.driverError as { errno?: number; code?: string } | undefined
  return driver?.errno === 1062 || driver?.code === 'ER_DUP_ENTRY'
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

  async create(
    ctx: SrsContext,
    dto: CreateGenericInvoiceDto,
  ): Promise<CreateGenericInvoiceResponseDto> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_INVOICES_MODULE_ACCESS)
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_INVOICE_CREATE)
    await this.assertCompanyCanCreate(ctx)
    await this.assertDealerInScope(ctx, dto.idDealer)

    if (dto.dateTo < dto.dateFrom) {
      throw new BadRequestException('End date cannot be earlier than start date.')
    }
    this.assertNoDuplicateDescriptions(dto)
    const selRel = dto.items.map((item) => item.description).join(', ')
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

    await this.upsertCatalogBestEffort(ctx, dto)

    try {
      return await this.persistStatement(ctx, dto, selRel)
    } catch (err) {
      if (!isDupEntry(err)) throw err
      return this.persistStatement(ctx, dto, selRel)
    }
  }

  private async persistStatement(
    ctx: SrsContext,
    dto: CreateGenericInvoiceDto,
    selRel: string,
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
      items: dto.items,
    })
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

  private assertNoDuplicateDescriptions(dto: CreateGenericInvoiceDto): void {
    const seen = new Set<string>()
    for (const item of dto.items) {
      const key = item.description.toLowerCase()
      if (seen.has(key)) {
        throw new BadRequestException('Item already exists')
      }
      seen.add(key)
    }
  }

  private async upsertCatalogBestEffort(ctx: SrsContext, dto: CreateGenericInvoiceDto): Promise<void> {
    for (const item of dto.items) {
      try {
        await this.repository.upsertCatalogItem(
          ctx.idDealerProvider,
          dto.idDealer,
          ctx.idUsuario,
          item.description,
          item.unitAmount,
        )
      } catch (err) {
        this.logCatalogUpsertError(`item "${item.description}"`, err)
      }
    }
    const header = dto.headerNote?.trim() ?? ''
    if (header) {
      try {
        await this.repository.upsertCatalogHeaderNote(
          ctx.idDealerProvider,
          dto.idDealer,
          ctx.idUsuario,
          header,
        )
      } catch (err) {
        this.logCatalogUpsertError('header note', err)
      }
    }
  }

  private logCatalogUpsertError(what: string, err: unknown): void {
    this.logger.error(
      `Generic invoice catalog upsert failed (${what}); continuing with statement create`,
      err instanceof Error ? err.stack : String(err),
    )
  }
}
