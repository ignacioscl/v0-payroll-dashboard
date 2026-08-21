import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'

import { SrsContext } from '../../auth/srs-auth-context.service'
import {
  ROL_ACCION_BILLING_DISTRICT,
  ROL_ACCION_INVOICES_MODULE_ACCESS,
  SrsPermissionRepository,
} from '../../auth/srs-permission.repository'
import { skipDealerRestrictionForRol } from '../../shared/kpi/srs-kpi-dealer-filter'
import { InvoiceRepository } from '../repository/invoice.repository'
import {
  InvoiceListQueryDto,
  InvoiceListResponseDto,
  buildInvoiceListFilter,
} from '../dto/invoice-list.dto'
import {
  InvoiceLookupQueryDto,
  InvoiceLookupResponseDto,
  buildDepartmentLookupFilter,
  buildServiceLookupFilter,
} from '../dto/invoice-lookup.dto'
import { InvoiceDetailResponseDto } from '../dto/invoice-detail.dto'

@Injectable()
export class InvoiceService {
  constructor(
    @Inject(InvoiceRepository) private readonly repository: InvoiceRepository,
    @Inject(SrsPermissionRepository) private readonly permissions: SrsPermissionRepository,
  ) {}

  private async assertInvoicesModuleAccess(ctx: SrsContext): Promise<void> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_INVOICES_MODULE_ACCESS)
  }

  async list(ctx: SrsContext, query: InvoiceListQueryDto): Promise<InvoiceListResponseDto> {
    await this.assertInvoicesModuleAccess(ctx)
    const filter = buildInvoiceListFilter(ctx, query)
    if (filter.dealerIds.length === 0) {
      throw new BadRequestException('Select at least one dealer to list invoices')
    }
    const [results, { total, summary }] = await Promise.all([
      this.repository.listPage(filter),
      this.repository.summary(filter),
    ])
    return {
      results,
      page: filter.page,
      pageSize: filter.pageSize,
      total,
      hasMore: filter.pageSize === -1 ? false : filter.page * filter.pageSize < total,
      summary,
    }
  }

  async detail(ctx: SrsContext, idStatement: number): Promise<InvoiceDetailResponseDto> {
    await this.assertInvoicesModuleAccess(ctx)
    const { inScope, statementType } = await this.repository.isStatementInScope({
      idStatement,
      idDealerProvider: ctx.idDealerProvider,
      idUsuario: ctx.idUsuario,
      skipDealerRestriction: skipDealerRestrictionForRol(ctx.idRol),
    })
    if (!inScope) {
      throw new NotFoundException('Invoice not found')
    }
    // Espeja el legacy (app.binvoice_main_table_inv.js): WO (tipo != 5 y != 6)
    // usa el detalle de servicios; TTK (5) y Generic (6) usan el rollup generic.
    // Pedir ambos genera filas vacías en statements WO (la query generic no
    // filtra id_invoice IS NULL), por eso ramificamos por tipo.
    const isWo = statementType !== 5 && statementType !== 6
    const idDealerProvider = ctx.idDealerProvider
    const [woRows, genericRows] = await Promise.all([
      isWo
        ? this.repository.detailWoRows(idStatement, idDealerProvider)
        : Promise.resolve([]),
      isWo
        ? Promise.resolve([])
        : this.repository.detailGenericRows(idStatement, idDealerProvider),
    ])
    return { idStatement, statementType, woRows, genericRows }
  }

  async lookupDepartments(
    ctx: SrsContext,
    query: InvoiceLookupQueryDto,
  ): Promise<InvoiceLookupResponseDto> {
    await this.assertInvoicesModuleAccess(ctx)
    const { dealerIds, search, limit } = buildDepartmentLookupFilter(query)
    if (dealerIds.length === 0) {
      throw new BadRequestException('Select at least one dealer')
    }
    const results = await this.repository.lookupDepartments({
      idDealerProvider: ctx.idDealerProvider,
      idUsuario: ctx.idUsuario,
      dealerIds,
      skipDealerRestriction: skipDealerRestrictionForRol(ctx.idRol),
      search,
      limit,
    })
    return { results }
  }

  async lookupServices(
    ctx: SrsContext,
    query: InvoiceLookupQueryDto,
  ): Promise<InvoiceLookupResponseDto> {
    await this.assertInvoicesModuleAccess(ctx)
    const { dealerIds, departmentIds, search, limit } = buildServiceLookupFilter(query)
    if (dealerIds.length === 0) {
      throw new BadRequestException('Select at least one dealer')
    }
    const results = await this.repository.lookupServices({
      idDealerProvider: ctx.idDealerProvider,
      idUsuario: ctx.idUsuario,
      dealerIds,
      departmentIds,
      skipDealerRestriction: skipDealerRestrictionForRol(ctx.idRol),
      search,
      limit,
    })
    return { results }
  }

  async lookupAuthors(
    ctx: SrsContext,
    query: InvoiceLookupQueryDto,
  ): Promise<InvoiceLookupResponseDto> {
    await this.assertInvoicesModuleAccess(ctx)
    const { dealerIds, search, limit } = buildDepartmentLookupFilter(query)
    if (dealerIds.length === 0) {
      throw new BadRequestException('Select at least one dealer')
    }
    const results = await this.repository.lookupAuthors({
      idDealerProvider: ctx.idDealerProvider,
      idUsuario: ctx.idUsuario,
      dealerIds,
      skipDealerRestriction: skipDealerRestrictionForRol(ctx.idRol),
      search,
      limit,
    })
    return { results }
  }

  async lookupWorkers(
    ctx: SrsContext,
    query: InvoiceLookupQueryDto,
  ): Promise<InvoiceLookupResponseDto> {
    await this.assertInvoicesModuleAccess(ctx)
    const { dealerIds, search, limit } = buildDepartmentLookupFilter(query)
    if (dealerIds.length === 0) {
      throw new BadRequestException('Select at least one dealer')
    }
    const results = await this.repository.lookupWorkers({
      idDealerProvider: ctx.idDealerProvider,
      idUsuario: ctx.idUsuario,
      dealerIds,
      skipDealerRestriction: skipDealerRestrictionForRol(ctx.idRol),
      search,
      limit,
    })
    return { results }
  }

  async lookupDistricts(
    ctx: SrsContext,
    query: InvoiceLookupQueryDto,
  ): Promise<{ results: Array<{ id: number; label: string; dealerIds: number[] }> }> {
    await this.assertInvoicesModuleAccess(ctx)
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_BILLING_DISTRICT)
    const { search, limit } = buildDepartmentLookupFilter(query)
    const results = await this.repository.lookupDistricts({
      idDealerProvider: ctx.idDealerProvider,
      search,
      limit,
    })
    return { results }
  }
}
