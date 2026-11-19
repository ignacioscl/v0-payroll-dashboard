import { Controller, Get, Inject, Param, ParseIntPipe, Query, Req, Res } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'

import { SrsKpiQueryDto } from '../../shared/kpi/srs-kpi-query.dto'

import { BillingKpiService } from '../service/billing-kpi.service'
import { OpenInvoicesService } from '../service/open-invoices.service'
import { OpenInvoicesCompareService } from '../service/open-invoices-compare.service'
import {
  OpenInvoiceCompareDto,
  OpenInvoiceSnapshotPageDto,
  OpenInvoiceSnapshotsQueryDto,
  OpenInvoicesDto,
  OpenInvoicesQueryDto,
} from '../dto/open-invoices.dto'
import {
  BillingKpiDto,
  BillingPeriodCollectionKpiDto,
  BillingWeekRowDto,
  IncomeByDealerDto,
  IncomeByDealerServicesQueryDto,
  IncomeServicesByDealerDto,
  IncomeServiceVehiclesDto,
  IncomeServiceVehiclesQueryDto,
  RemovedDealersAvailableDto,
  RemovedDealersAvailableQueryDto,
  UnbilledAgingBucketDto,
  UnbilledDealerRowDto,
} from '../dto/billing-kpi.dto'
@Controller('/srs/kpis/billing')
@ApiTags('SRS KPIs - Billing')
@ApiBearerAuth()
export class BillingKpiController {
  constructor(
    @Inject(BillingKpiService) private readonly service: BillingKpiService,
    @Inject(OpenInvoicesService) private readonly openInvoices: OpenInvoicesService,
    @Inject(OpenInvoicesCompareService) private readonly openInvoicesCompare: OpenInvoicesCompareService,
  ) {}

  @Get('/')
  @ApiOkResponse({ type: BillingKpiDto })
  async getBillingKpis(
    @Req() request: any,
    @Query() query: SrsKpiQueryDto,
  ): Promise<BillingKpiDto> {
    return this.service.getBillingKpis(request.srsContext, query)
  }

  @Get('/unbilled-aging')
  @ApiOkResponse({ type: [UnbilledAgingBucketDto] })
  async getUnbilledAging(
    @Req() request: any,
    @Query() query: SrsKpiQueryDto,
  ): Promise<UnbilledAgingBucketDto[]> {
    return this.service.getUnbilledAging(request.srsContext, query)
  }

  @Get('/by-week')
  @ApiOkResponse({ type: [BillingWeekRowDto] })
  async getBillingByWeek(
    @Req() request: any,
    @Query() query: SrsKpiQueryDto,
  ): Promise<BillingWeekRowDto[]> {
    return this.service.getBillingByWeek(request.srsContext, query)
  }

  @Get('/unbilled-by-dealer')
  @ApiOkResponse({ type: [UnbilledDealerRowDto] })
  async getUnbilledByDealer(
    @Req() request: any,
    @Query() query: SrsKpiQueryDto,
  ): Promise<UnbilledDealerRowDto[]> {
    return this.service.getUnbilledByDealer(request.srsContext, query)
  }

  @Get('/income-by-dealer')
  @ApiOkResponse({ type: IncomeByDealerDto })
  async getIncomeByDealer(
    @Req() request: any,
    @Query() query: SrsKpiQueryDto,
  ): Promise<IncomeByDealerDto> {
    return this.service.getIncomeByDealer(request.srsContext, query)
  }

  @Get('/income-by-dealer/services')
  @ApiOkResponse({ type: IncomeServicesByDealerDto })
  async getIncomeServicesByDealer(
    @Req() request: any,
    @Query() query: IncomeByDealerServicesQueryDto,
  ): Promise<IncomeServicesByDealerDto> {
    return this.service.getIncomeServicesByDealer(request.srsContext, query)
  }

  @Get('/income-by-dealer/services/vehicles')
  @ApiOkResponse({ type: IncomeServiceVehiclesDto })
  async getIncomeServiceVehicles(
    @Req() request: any,
    @Query() query: IncomeServiceVehiclesQueryDto,
  ): Promise<IncomeServiceVehiclesDto> {
    return this.service.getIncomeServiceVehicles(request.srsContext, query)
  }

  @Get('/removed-dealers-available')
  @ApiOkResponse({ type: RemovedDealersAvailableDto })
  async getRemovedDealersAvailable(
    @Req() request: any,
    @Query() query: RemovedDealersAvailableQueryDto,
  ): Promise<RemovedDealersAvailableDto> {
    return this.service.getRemovedDealersAvailable(request.srsContext, query)
  }

  @Get('/period-collection')
  @ApiOkResponse({ type: BillingPeriodCollectionKpiDto })
  async getPeriodCollectionKpis(
    @Req() request: any,
    @Query() query: SrsKpiQueryDto,
  ): Promise<BillingPeriodCollectionKpiDto> {
    return this.service.getPeriodCollectionKpis(request.srsContext, query)
  }

  /** Reports › Open Invoices (plans/plan-reporte-javier T4): dealer × department by age, As of a Sunday. */
  @Get('/open-invoices')
  @ApiOkResponse({ type: OpenInvoicesDto })
  async getOpenInvoices(@Req() request: any, @Query() query: OpenInvoicesQueryDto): Promise<OpenInvoicesDto> {
    return this.openInvoices.getReport(request.srsContext, query)
  }

  /** Excel of Open Invoices (T5); saves the snapshot of what it shows first (T6). */
  @Get('/open-invoices/export')
  @ApiOkResponse({ description: 'XLSX: Report Info + Summary + Invoices' })
  async exportOpenInvoices(
    @Req() request: any,
    @Query() query: OpenInvoicesQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.openInvoices.export(request.srsContext, query, res)
  }

  /** Snapshots of Open Invoices, newest first, cut to the dealers of the user (T7). */
  @Get('/open-invoices/snapshots')
  @ApiOkResponse({ type: OpenInvoiceSnapshotPageDto })
  async listOpenInvoiceSnapshots(
    @Req() request: any,
    @Query() query: OpenInvoiceSnapshotsQueryDto,
  ): Promise<OpenInvoiceSnapshotPageDto> {
    return this.openInvoicesCompare.list(request.srsContext, query)
  }

  /** A snapshot compared with today, invoice by invoice, with the reason of each change (T7). */
  @Get('/open-invoices/snapshots/:id/compare')
  @ApiOkResponse({ type: OpenInvoiceCompareDto })
  async compareOpenInvoiceSnapshot(
    @Req() request: any,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<OpenInvoiceCompareDto> {
    const { labels: _labels, ...dto } = await this.openInvoicesCompare.compare(request.srsContext, id)
    return dto
  }

  /** Excel of the comparison: Report Info + Changes (T7). */
  @Get('/open-invoices/snapshots/:id/compare/export')
  @ApiOkResponse({ description: 'XLSX: Report Info + Changes' })
  async exportOpenInvoiceSnapshotCompare(
    @Req() request: any,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ): Promise<void> {
    await this.openInvoicesCompare.compareExport(request.srsContext, id, res)
  }
}
