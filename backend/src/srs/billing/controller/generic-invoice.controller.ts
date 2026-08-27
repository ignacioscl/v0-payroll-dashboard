import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Put,
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
  GenericInvoiceDetailDto,
  GenericTtkEmployeesQueryDto,
  GenericTtkEmployeesResponseDto,
  UpdateGenericInvoiceDto,
  UpdateGenericInvoiceResponseDto,
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

  @Get('/generic-invoices/ttk-employees')
  @ApiOkResponse({ type: GenericTtkEmployeesResponseDto })
  async ttkEmployees(
    @Req() request: any,
    @Query() query: GenericTtkEmployeesQueryDto,
  ): Promise<GenericTtkEmployeesResponseDto> {
    return this.service.listTtkEmployees(request.srsContext, query)
  }

  @Get('/generic-catalog')
  @ApiOkResponse({ type: [GenericCatalogItemDto] })
  async catalog(
    @Req() request: any,
    @Query() query: GenericCatalogQueryDto,
  ): Promise<GenericCatalogItemDto[]> {
    return this.service.listCatalog(request.srsContext, query.cat, query.idDealer, query.q)
  }

  @Get('/generic-invoices/:id')
  @ApiOkResponse({ type: GenericInvoiceDetailDto })
  async getById(
    @Req() request: any,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<GenericInvoiceDetailDto> {
    return this.service.getById(request.srsContext, id)
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
    return this.service.create(request.srsContext, body, request.body)
  }

  @Put('/generic-invoices/:id')
  @ApiOkResponse({ type: UpdateGenericInvoiceResponseDto })
  async update(
    @Req() request: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateGenericInvoiceDto,
  ): Promise<UpdateGenericInvoiceResponseDto> {
    return this.service.update(request.srsContext, id, body, request.body)
  }
}
