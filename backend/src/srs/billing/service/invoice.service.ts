import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'

import { SrsContext } from '../../auth/srs-auth-context.service'
import { skipDealerRestrictionForRol } from '../../shared/kpi/srs-kpi-dealer-filter'
import { InvoiceRepository } from '../repository/invoice.repository'
import {
  InvoiceListQueryDto,
  InvoiceListResponseDto,
  buildInvoiceListFilter,
} from '../dto/invoice-list.dto'
import { InvoiceDetailResponseDto } from '../dto/invoice-detail.dto'

@Injectable()
export class InvoiceService {
  constructor(@Inject(InvoiceRepository) private readonly repository: InvoiceRepository) {}

  async list(ctx: SrsContext, query: InvoiceListQueryDto): Promise<InvoiceListResponseDto> {
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
      hasMore: filter.page * filter.pageSize < total,
      summary,
    }
  }

  async detail(ctx: SrsContext, idStatement: number): Promise<InvoiceDetailResponseDto> {
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
}
