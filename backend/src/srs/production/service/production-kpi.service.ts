import { ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import type { Response } from 'express'

import { SRS_CONNECTION } from '../../srs.datasource'
import { ProductionKpiRepository } from '../repository/production-kpi.repository'
import { ProductionKpiDto, ProductionWeekRowDto, WoStatusSliceDto } from '../dto/production-kpi.dto'
import { SrsContext } from '../../auth/srs-auth-context.service'
import { ROL_ACCION_PRODUCTION_REPORT, SrsPermissionRepository } from '../../auth/srs-permission.repository'
import { SrsKpiQueryDto } from '../../shared/kpi/srs-kpi-query.dto'
import { buildSrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { removedDealersProvider } from '../../shared/kpi/srs-kpi-dealer-filter'
import { buildTableExportWorkbook } from '../../shared/export/table-export-xlsx'
import {
  buildNyStampedExportFilename,
  contentDispositionAttachment,
  formatNyStamp,
  XLSX_MIME,
} from '../../punch/punch-export-format'
import { loadDealerNames, loadUserName, resolveLocale } from '../../punch/punch-export-lookups'
import { productionGoalExportLabels } from '../production-goal-export-labels'
import {
  buildProductionGoalReportInfo,
  productionGoalColumns,
  sortLikeProductionGrid,
} from '../production-goal-export'

@Injectable()
export class ProductionKpiService {
  constructor(
    @Inject(ProductionKpiRepository) private readonly repository: ProductionKpiRepository,
    @Inject(SrsPermissionRepository) private readonly permissions: SrsPermissionRepository,
    @InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource,
  ) {}

  async getProductionKpis(ctx: SrsContext, query: SrsKpiQueryDto): Promise<ProductionKpiDto> {
    return this.repository.getProductionKpis(buildSrsKpiFilter(ctx, query))
  }

  async getOpenPipeline(ctx: SrsContext, query: SrsKpiQueryDto): Promise<WoStatusSliceDto[]> {
    return this.repository.getOpenPipeline(buildSrsKpiFilter(ctx, query))
  }

  async getDealerProduction(ctx: SrsContext, query: SrsKpiQueryDto) {
    return this.repository.getDealerProduction(buildSrsKpiFilter(ctx, query))
  }

  async getProductionByWeek(
    ctx: SrsContext,
    query: SrsKpiQueryDto,
  ): Promise<ProductionWeekRowDto[]> {
    return this.repository.getProductionByWeek(buildSrsKpiFilter(ctx, query))
  }

  /**
   * Reports › Production vs Goal, Export: the grid's rows (the same query as the screen) with
   * Report Info, built here and not in the browser (D5). plans/plan-report-info-exports-tablas §5.1.
   * Same gate as the screen and Income by Dealer: «Reports > Production Report» (admins pass).
   */
  async exportDealerProduction(ctx: SrsContext, query: SrsKpiQueryDto, res: Response): Promise<void> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_PRODUCTION_REPORT)
    const filter = buildSrsKpiFilter(ctx, query)
    const requested = [...new Set(filter.dealerIds)]
    // GET_DEALER_NAME_BY_PROVIDER does not look at the scope: name only dealers of this company
    // that the user can see.
    if ((await this.repository.countRequestedDealersInScope(filter)) !== requested.length) {
      throw new ForbiddenException('One or more dealers are outside your scope.')
    }

    const rows = sortLikeProductionGrid(await this.repository.getDealerProduction(filter))
    const removedOf = removedDealersProvider(filter)
    const removed = removedOf != null ? await this.repository.removedDealersOfProvider(removedOf) : []
    const removedIds = new Set(removed.map((d) => d.dealerId))
    const rowIds = new Set(rows.map((r) => r.dealerId))
    const removedWithRows = removed.filter((d) => rowIds.has(d.dealerId)).map((d) => d.dealer)

    const generatedAt = new Date()
    const [locale, generatedBy, dealerNames] = await Promise.all([
      resolveLocale(this.srs, ctx),
      loadUserName(this.srs, ctx.idUsuario),
      loadDealerNames(this.srs, ctx.idDealerProvider, requested),
    ])
    const labels = productionGoalExportLabels(locale)

    const workbook = buildTableExportWorkbook({
      reportInfoSheet: labels.reportInfo,
      reportInfoHeader: { field: labels.field, value: labels.value },
      reportInfo: buildProductionGoalReportInfo({
        labels,
        generatedAt,
        generatedBy,
        fechaDesde: filter.fechaDesde,
        fechaHasta: filter.fechaHasta,
        dealerNames,
        filterDateDone: filter.filterDateDone,
        includeRemovedDealers: removedOf != null,
        removedDealersWithRows: removedWithRows,
      }),
      dataSheet: labels.reportName,
      stamp: `${labels.generated} ${formatNyStamp(generatedAt)} · ${labels.reportName}`,
      columns: productionGoalColumns(labels, removedIds),
      rows,
    })

    res.setHeader('Content-Type', XLSX_MIME)
    res.setHeader(
      'Content-Disposition',
      contentDispositionAttachment(buildNyStampedExportFilename('production_vs_goal', generatedAt)),
    )
    // The book is already whole in memory: `write` dumps it to the response and closes it.
    await workbook.xlsx.write(res)
  }
}
