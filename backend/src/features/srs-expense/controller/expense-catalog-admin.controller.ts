import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'

import { SrsJwtGuard } from 'src/srs/auth/srs-jwt.guard'
import { CompanyModuleGuard, RequireCompanyModule } from 'src/features/srs-contratista/guard/company-module.guard'
import { MergeCatalogItemDto } from 'src/features/srs-generic-data/dto/generic-data.dto'
import { ExpenseCatalogAdminService } from '../service/expense-catalog-admin.service'

/**
 * Expenses › Settings: borrar y unificar compañías y categorías. Vive con los gastos (dueño de EXP_EXPENSE) porque
 * mueve gastos y reglas; el listado y el alta siguen en ExpenseCatalogController. plans/plan-expenses-settings, §3.
 */
@UseGuards(SrsJwtGuard, CompanyModuleGuard)
@RequireCompanyModule('expenses')
@Controller('/srs/expenses')
@ApiTags('SRS Expenses - Catalog')
@ApiBearerAuth()
export class ExpenseCatalogAdminController {
  constructor(@Inject(ExpenseCatalogAdminService) private readonly service: ExpenseCatalogAdminService) {}

  @Get('companies/:id(\\d+)/usage')
  companyUsage(@Req() request: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.usage(request.srsContext, 'company', id)
  }

  @Get('categories/:id(\\d+)/usage')
  categoryUsage(@Req() request: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.usage(request.srsContext, 'category', id)
  }

  @Delete('companies/:id(\\d+)')
  @HttpCode(204)
  async removeCompany(@Req() request: any, @Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.service.remove(request.srsContext, 'company', id)
  }

  @Delete('categories/:id(\\d+)')
  @HttpCode(204)
  async removeCategory(@Req() request: any, @Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.service.remove(request.srsContext, 'category', id)
  }

  @Post('companies/:id(\\d+)/merge')
  @HttpCode(200)
  mergeCompany(@Req() request: any, @Param('id', ParseIntPipe) id: number, @Body() body: MergeCatalogItemDto) {
    return this.service.merge(request.srsContext, 'company', id, body.targetId)
  }

  @Post('categories/:id(\\d+)/merge')
  @HttpCode(200)
  mergeCategory(@Req() request: any, @Param('id', ParseIntPipe) id: number, @Body() body: MergeCatalogItemDto) {
    return this.service.merge(request.srsContext, 'category', id, body.targetId)
  }
}
