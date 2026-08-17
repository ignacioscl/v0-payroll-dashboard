import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'

import { SrsJwtGuard } from '../../auth/srs-jwt.guard'
import {
  CreateGenericInvoiceDto,
  CreateGenericInvoiceResponseDto,
  GenericCatalogItemDto,
  GenericCatalogQueryDto,
  GenericInvoiceConfigDto,
} from '../dto/generic-invoice.dto'
import { GenericInvoiceService } from '../service/generic-invoice.service'

@UseGuards(SrsJwtGuard)
@Controller('/srs/billing')
@ApiTags('SRS Billing - Generic Invoices')
@ApiBearerAuth()
export class GenericInvoiceController {
  constructor(@Inject(GenericInvoiceService) private readonly service: GenericInvoiceService) {}

  @Get('/generic-invoices/config')
  @ApiOkResponse({ type: GenericInvoiceConfigDto })
  async config(@Req() request: any): Promise<GenericInvoiceConfigDto> {
    return this.service.config(request.srsContext)
  }

  @Get('/generic-catalog')
  @ApiOkResponse({ type: [GenericCatalogItemDto] })
  async catalog(
    @Req() request: any,
    @Query() query: GenericCatalogQueryDto,
  ): Promise<GenericCatalogItemDto[]> {
    return this.service.listCatalog(request.srsContext, query.cat, query.idDealer, query.q)
  }

  @Delete('/generic-catalog/:id')
  async deleteCatalog(
    @Req() request: any,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ ok: true }> {
    await this.service.deleteCatalogItem(request.srsContext, id)
    return { ok: true }
  }

  @Post('/generic-invoices')
  @ApiOkResponse({ type: CreateGenericInvoiceResponseDto })
  async create(
    @Req() request: any,
    @Body() body: CreateGenericInvoiceDto,
  ): Promise<CreateGenericInvoiceResponseDto> {
    return this.service.create(request.srsContext, body)
  }
}
