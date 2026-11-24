import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SrsContext } from '../../auth/srs-auth-context.service'
import {
  ROL_ACCION_INVOICE_CREATE,
  ROL_ACCION_INVOICES_MODULE_ACCESS,
  ROL_ACCION_WO_DELETE,
  ROL_ACCION_WO_DELETE_IN_TRANSIT,
  SrsPermissionRepository,
} from '../../auth/srs-permission.repository'
import { assertDealerInScope, dealerScopeReader } from '../billing-dealer-scope'
import {
  INVOICE_TYPE_SELECTED_SERVICES,
  WO_TO_BE_BILLED_DEFAULT_PAGE_SIZE,
  WO_TO_BE_BILLED_MAX_PAGE_SIZE,
  WoInvoiceType,
  WoToBeBilledConfigDto,
  WoToBeBilledFilterDto,
  WoToBeBilledListQueryDto,
  WoToBeBilledListResponseDto,
  WoToBeBilledPreviewDto,
  WoToBeBilledSummaryDto,
} from '../dto/wo-to-be-billed.dto'
import { WoToBeBilledRepository } from '../repository/wo-to-be-billed.repository'
import { buildWoInvoicePlan } from '../wo-invoice-plan'
import { WoToBeBilledFilter } from '../wo-to-be-billed-sql'

/** Tope de `INVOICE_STATEMENT.invoice_service_sel_rel` (`DUMP:1802`). */
export const SEL_REL_MAX = 9000

export const MSG_SELECT_INVOICE_TYPE = 'Select an Invoice Type'
export const MSG_SELECT_ONE_SERVICE = 'Select at least one service'
export const MSG_NOTHING_TO_INVOICE = 'There is nothing to invoice with these filters'

/** El filtro validado y, para «Selected Services», los nombres de los servicios elegidos en el orden en que llegaron. */
export type ResolvedWoFilter = {
  filter: WoToBeBilledFilter
  invoiceType: WoInvoiceType | null
  serviceNames: string[]
}

/**
 * WO to be Billed (plans/plan-wo-to-be-billed-v0, T4): lista, total, `/config` y la cuenta previa. Todos piden
 * «Invoices > Modulde Access» (15) y «Invoices > Create Invoice» (16) y sesión interna (D7). `resolveFilter` es la
 * validación del filtro que usa también la generación (feature `srs-invoice-statement`).
 */
@Injectable()
export class WoToBeBilledService {
  constructor(
    private readonly repository: WoToBeBilledRepository,
    private readonly permissions: SrsPermissionRepository,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  /** El control de la pantalla: permisos 15 y 16 y sesión interna. */
  async assertScreenAccess(ctx: SrsContext): Promise<void> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_INVOICES_MODULE_ACCESS)
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_INVOICE_CREATE)
    await this.permissions.assertInternalSession(ctx)
  }

  assertDealerInScope(ctx: SrsContext, idDealer: number): Promise<void> {
    return assertDealerInScope(ctx, idDealer, dealerScopeReader(this.db))
  }

  async list(ctx: SrsContext, query: WoToBeBilledListQueryDto): Promise<WoToBeBilledListResponseDto> {
    await this.assertScreenAccess(ctx)
    const { filter } = await this.resolveFilter(ctx, query, { forGenerate: false })
    const page = query.page && query.page > 0 ? query.page : 1
    const pageSize = Math.min(query.pageSize ?? WO_TO_BE_BILLED_DEFAULT_PAGE_SIZE, WO_TO_BE_BILLED_MAX_PAGE_SIZE)
    const { rows, hasMore } = await this.repository.list(filter, page, pageSize)
    return { results: rows, page, pageSize, hasMore }
  }

  async summary(ctx: SrsContext, query: WoToBeBilledFilterDto): Promise<WoToBeBilledSummaryDto> {
    await this.assertScreenAccess(ctx)
    const { filter } = await this.resolveFilter(ctx, query, { forGenerate: false })
    return this.repository.summary(filter)
  }

  async config(ctx: SrsContext, idDealer: number): Promise<WoToBeBilledConfigDto> {
    await this.assertScreenAccess(ctx)
    await this.assertDealerInScope(ctx, idDealer)
    const canDelete = await this.permissions.userHasRolAccion(ctx, ROL_ACCION_WO_DELETE)
    const canDeleteInTransit = await this.permissions.userHasRolAccion(ctx, ROL_ACCION_WO_DELETE_IN_TRANSIT)
    const trash = ctx.idRol === 1 ? true : await this.repository.hasTrashIcon(ctx.idUsuario, ctx.idUsuarioRolrel)
    return {
      // La pantalla ya exige 16 (Create Invoice): quien entra puede generar.
      canGenerate: true,
      canDeleteSelected: canDelete,
      canDeleteRow: trash && canDelete,
      canDeleteRowInTransitOnly: trash && !canDelete && canDeleteInTransit,
    }
  }

  /** La cuenta previa: el mismo plan que la generación, sin candado y sin escribir. Es informativa. */
  async preview(ctx: SrsContext, dto: WoToBeBilledFilterDto): Promise<WoToBeBilledPreviewDto> {
    await this.assertScreenAccess(ctx)
    const resolved = await this.resolveFilter(ctx, dto, { forGenerate: true })
    const lines = await this.repository.pendingLines(resolved.filter)
    const plan = buildWoInvoicePlan(
      { invoiceType: resolved.invoiceType as WoInvoiceType, departments: resolved.filter.departments, services: resolved.filter.services },
      lines,
    )
    return { workOrders: plan.workOrders, invoices: plan.invoices.length }
  }

  /**
   * La validación del filtro (T4): fechas, dealer en alcance, departments y services del dealer y de la empresa (403 si
   * no), y las reglas de Invoice Type. Con `forGenerate`, el Invoice Type es obligatorio y «Selected Services» pide al
   * menos un servicio.
   */
  async resolveFilter(
    ctx: SrsContext,
    dto: WoToBeBilledFilterDto,
    opts: { forGenerate: boolean },
  ): Promise<ResolvedWoFilter> {
    if (dto.dateTo < dto.dateFrom) {
      throw new BadRequestException('End date cannot be earlier than start date.')
    }
    await this.assertDealerInScope(ctx, dto.idDealer)

    const invoiceType = dto.invoiceType ?? null
    const departments = [...new Set(dto.departments ?? [])]
    const services = [...new Set(dto.services ?? [])]

    if (opts.forGenerate && invoiceType == null) {
      throw new BadRequestException(MSG_SELECT_INVOICE_TYPE)
    }
    if (invoiceType !== INVOICE_TYPE_SELECTED_SERVICES) {
      // Con «by Services» y «Multi-Services» (y sin tipo) se elige un department y un servicio, de a uno, y el servicio
      // solo después del department (legacy: `json.invoiceservices.php:26`, `app.binvoice_main.js:225-226`).
      if (departments.length > 1 || services.length > 1 || (services.length === 1 && departments.length !== 1)) {
        throw new BadRequestException('Select one department and one service')
      }
    } else if (opts.forGenerate && services.length === 0) {
      throw new BadRequestException(MSG_SELECT_ONE_SERVICE)
    }

    if (departments.length) {
      const found = await this.repository.countDepartmentsOfDealer(departments, dto.idDealer, ctx.idDealerProvider)
      if (found !== departments.length) throw new ForbiddenException('Forbidden')
    }
    let serviceNames: string[] = []
    if (services.length) {
      const found = await this.repository.servicesOfDealer(services, dto.idDealer, ctx.idDealerProvider)
      if (found.length !== services.length) throw new ForbiddenException('Forbidden')
      if (invoiceType !== INVOICE_TYPE_SELECTED_SERVICES && found[0].idDepartment !== departments[0]) {
        throw new BadRequestException('Select one department and one service')
      }
      serviceNames = found.map((s) => s.nombre)
    }
    if (opts.forGenerate && invoiceType === INVOICE_TYPE_SELECTED_SERVICES && serviceNames.join(', ').length > SEL_REL_MAX) {
      throw new BadRequestException('The selected services exceed 9000 characters.')
    }

    return {
      invoiceType,
      serviceNames,
      filter: {
        idDealerProvider: ctx.idDealerProvider,
        idDealer: dto.idDealer,
        dateFrom: dto.dateFrom,
        dateTo: dto.dateTo,
        status: [...new Set(dto.status ?? [])],
        departments,
        services,
        invoiceType,
        includeZero: dto.includeZero === true,
        approved: dto.approved ?? '',
        wo: dto.wo ?? null,
        stock: dto.stock ?? null,
        price: dto.price ?? null,
        ro: dto.ro ?? null,
        po: dto.po ?? null,
        woIds: opts.forGenerate ? [...new Set(dto.woIds ?? [])] : [],
      },
    }
  }
}
