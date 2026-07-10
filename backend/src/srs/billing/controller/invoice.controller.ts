import { Controller, Get, Inject, Param, ParseIntPipe, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'

import { SrsJwtGuard } from '../../auth/srs-jwt.guard'

import { InvoiceService } from '../service/invoice.service'
import { InvoiceListQueryDto, InvoiceListResponseDto } from '../dto/invoice-list.dto'
import { InvoiceLookupQueryDto, InvoiceLookupResponseDto } from '../dto/invoice-lookup.dto'
import { InvoiceDetailResponseDto } from '../dto/invoice-detail.dto'

@UseGuards(SrsJwtGuard)
@Controller('/srs/billing')
@ApiTags('SRS Billing - Invoices')
@ApiBearerAuth()
export class InvoiceController {
  constructor(@Inject(InvoiceService) private readonly service: InvoiceService) {}

  @Get('/invoices')
  @ApiOkResponse({ type: InvoiceListResponseDto })
  async list(
    @Req() request: any,
    @Query() query: InvoiceListQueryDto,
  ): Promise<InvoiceListResponseDto> {
    return this.service.list(request.srsContext, query)
  }

  @Get('/invoices/lookups/departments')
  @ApiOkResponse({ type: InvoiceLookupResponseDto })
  async lookupDepartments(
    @Req() request: any,
    @Query() query: InvoiceLookupQueryDto,
  ): Promise<InvoiceLookupResponseDto> {
    return this.service.lookupDepartments(request.srsContext, query)
  }

  @Get('/invoices/lookups/services')
  @ApiOkResponse({ type: InvoiceLookupResponseDto })
  async lookupServices(
    @Req() request: any,
    @Query() query: InvoiceLookupQueryDto,
  ): Promise<InvoiceLookupResponseDto> {
    return this.service.lookupServices(request.srsContext, query)
  }

  @Get('/invoices/:id/detail')
  @ApiOkResponse({ type: InvoiceDetailResponseDto })
  async detail(
    @Req() request: any,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<InvoiceDetailResponseDto> {
    return this.service.detail(request.srsContext, id)
  }
}
