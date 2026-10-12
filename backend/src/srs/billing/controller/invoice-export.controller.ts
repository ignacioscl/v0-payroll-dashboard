import { Body, Controller, Get, Inject, Post, Query, Req, Res, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'

import { SrsJwtGuard } from '../../auth/srs-jwt.guard'
import { InvoiceListQueryDto } from '../dto/invoice-list.dto'
import {
  InvoiceExportMailBodyDto,
  InvoiceExportPrepareBodyDto,
  InvoiceExportPrepareResponseDto,
  InvoiceExportStatusDto,
  InvoiceExportTicketQueryDto,
} from '../dto/invoice-export.dto'
import { InvoiceExportService } from '../service/invoice-export.service'

/** Set by the Next proxy from the session (D24); it overwrites whatever the browser sends. */
function isCompanyType(request: any): boolean {
  return String(request.headers['x-srs-company-type'] ?? '') === '1'
}

/**
 * The PHP token of the user, as the Next proxy forwards it (`Authorization: Bearer <token>`,
 * FE/lib/backend-upstream.ts). Nest hands it to the PHP for the queue, kept only in memory (§2.1.8).
 */
function phpTokenOf(request: any): string {
  return String(request.headers['authorization'] ?? '').replace('Bearer ', '').trim()
}

/**
 * Export of Billing → Invoices (plans/plan-export-invoices-nest §2.1.2). The filters travel in
 * the query through the same InvoiceListQueryDto as the grid; `page`/`pageSize` are ignored.
 */
@UseGuards(SrsJwtGuard)
@Controller('/srs/billing/invoices/export')
@ApiTags('SRS Billing - Invoices export')
@ApiBearerAuth()
export class InvoiceExportController {
  constructor(@Inject(InvoiceExportService) private readonly service: InvoiceExportService) {}

  @Post('/prepare')
  @ApiOkResponse({ type: InvoiceExportPrepareResponseDto })
  async prepare(
    @Req() request: any,
    @Query() query: InvoiceListQueryDto,
    @Body() body: InvoiceExportPrepareBodyDto,
  ): Promise<InvoiceExportPrepareResponseDto> {
    return this.service.prepare(request.srsContext, query, body, isCompanyType(request))
  }

  /** Send Email (§8.7): answers at once with a ticket; the job keeps going in the background. */
  @Post('/email')
  async email(
    @Req() request: any,
    @Query() query: InvoiceListQueryDto,
    @Body() body: InvoiceExportMailBodyDto,
  ): Promise<{ ticket: string }> {
    return this.service.startMail(
      request.srsContext,
      query,
      body,
      'email',
      isCompanyType(request),
      phpTokenOf(request),
    )
  }

  /** Create File to Email (§8.7): adds the file to the active queue; does not send. */
  @Post('/queue')
  async queue(
    @Req() request: any,
    @Query() query: InvoiceListQueryDto,
    @Body() body: InvoiceExportMailBodyDto,
  ): Promise<{ ticket: string }> {
    return this.service.startMail(
      request.srsContext,
      query,
      body,
      'queue',
      isCompanyType(request),
      phpTokenOf(request),
    )
  }

  @Get('/status')
  @ApiOkResponse({ type: InvoiceExportStatusDto })
  getStatus(
    @Req() request: any,
    @Query() query: InvoiceExportTicketQueryDto,
  ): InvoiceExportStatusDto {
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
