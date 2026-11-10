import { Body, Controller, Get, Inject, Param, ParseIntPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'

import { SrsJwtGuard } from 'src/srs/auth/srs-jwt.guard'
import { CompanyModuleGuard, RequireCompanyModule } from 'src/features/srs-contratista/guard/company-module.guard'
import { CatalogQueryDto, CreateCatalogItemDto, UpdateCatalogItemDto } from '../dto/generic-data.dto'
import { ExpenseCatalogService } from '../service/expense-catalog.service'

/** Expenses › Settings: compañías (GENERIC_DATA 34) y categorías (35). Contrato en plans/plan-expenses-pro/AVANCE.md. */
@UseGuards(SrsJwtGuard, CompanyModuleGuard)
@RequireCompanyModule('expenses')
@Controller('/srs/expenses')
@ApiTags('SRS Expenses - Catalog')
@ApiBearerAuth()
export class ExpenseCatalogController {
  constructor(@Inject(ExpenseCatalogService) private readonly service: ExpenseCatalogService) {}

  @Get('companies')
  listCompanies(@Req() request: any, @Query() query: CatalogQueryDto) {
    return this.service.list(request.srsContext, 'company', query)
  }

  @Get('categories')
  listCategories(@Req() request: any, @Query() query: CatalogQueryDto) {
    return this.service.list(request.srsContext, 'category', query)
  }

  @Post('companies')
  createCompany(@Req() request: any, @Body() body: CreateCatalogItemDto) {
    return this.service.create(request.srsContext, 'company', body)
  }

  @Post('categories')
  createCategory(@Req() request: any, @Body() body: CreateCatalogItemDto) {
    return this.service.create(request.srsContext, 'category', body)
  }

  @Put('companies/:id(\\d+)')
  updateCompany(@Req() request: any, @Param('id', ParseIntPipe) id: number, @Body() body: UpdateCatalogItemDto) {
    return this.service.update(request.srsContext, 'company', id, body)
  }

  @Put('categories/:id(\\d+)')
  updateCategory(@Req() request: any, @Param('id', ParseIntPipe) id: number, @Body() body: UpdateCatalogItemDto) {
    return this.service.update(request.srsContext, 'category', id, body)
  }
}
