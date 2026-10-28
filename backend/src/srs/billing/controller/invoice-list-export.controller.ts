import { Controller, Get, Inject, Post, Query, Req, Res, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'

import { SrsJwtGuard } from '../../auth/srs-jwt.guard'
import { InvoiceListQueryDto } from '../dto/invoice-list.dto'
import {
  InvoiceExportPrepareResponseDto,
  InvoiceExportStatusDto,
  InvoiceExportTicketQueryDto,
} from '../dto/invoice-export.dto'
import { InvoiceListExportService } from '../service/invoice-list-export.service'

/**
 * «Export» of the Invoices grid's toolbar (plans/plan-report-info-exports-tablas §6). Same three
 * steps as Export / Email: prepare (the grid's query, `page`/`pageSize` ignored) → status → download.
 */
@UseGuards(SrsJwtGuard)
@Controller('/srs/billing/invoices/list-export')
@ApiTags('SRS Billing - Invoices list export')
@ApiBearerAuth()
export class InvoiceListExportController {
  constructor(@Inject(InvoiceListExportService) private readonly service: InvoiceListExportService) {}

  @Post('/prepare')
  @ApiOkResponse({ type: InvoiceExportPrepareResponseDto })
  async prepare(
    @Req() request: any,
    @Query() query: InvoiceListQueryDto,
  ): Promise<InvoiceExportPrepareResponseDto> {
    return this.service.prepare(request.srsContext, query)
  }

  @Get('/status')
  @ApiOkResponse({ type: InvoiceExportStatusDto })
  getStatus(@Req() request: any, @Query() query: InvoiceExportTicketQueryDto): InvoiceExportStatusDto {
    return this.service.getStatus(request.srsContext, query.ticket)
  }

  @Get('/')
  async download(
    @Req() request: any,
    @Query() query: InvoiceExportTicketQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    return this.service.streamToResponse(request.srsContext, query.ticket, res)
  }
}
