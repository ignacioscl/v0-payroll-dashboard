import { Controller, Get, Inject, Query, Req, Res, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'

import { SrsJwtGuard } from '../../auth/srs-jwt.guard'
import { CompanyModuleGuard, RequireCompanyModule } from 'src/features/srs-contratista/guard/company-module.guard'
import { ExpenseAnalyticsQueryDto, ExpenseEmployeesQueryDto, ExpenseListQueryDto } from '../dto/expense-list-query.dto'
import { ExpenseReportService } from '../service/expense-report.service'

/**
 * Expenses List, summary, export, Analytics y empleados. Las rutas con id viven en ExpenseController con
 * `':id(\\d+)'`, así `summary`, `export`, `analytics` y `employees` nunca caen en `GET /:id`.
 */
@UseGuards(SrsJwtGuard, CompanyModuleGuard)
@RequireCompanyModule('expenses')
@Controller('/srs/expenses')
@ApiTags('SRS Expenses')
@ApiBearerAuth()
export class ExpenseReportController {
  constructor(@Inject(ExpenseReportService) private readonly service: ExpenseReportService) {}

  @Get()
  list(@Req() request: any, @Query() query: ExpenseListQueryDto) {
    return this.service.list(request.srsContext, query)
  }

  @Get('summary')
  summary(@Req() request: any, @Query() query: ExpenseListQueryDto) {
    return this.service.summary(request.srsContext, query)
  }

  @Get('export')
  @ApiOkResponse({ description: 'XLSX: Report Info + Expenses (una fila por EXP_EXPENSE)' })
  async export(@Req() request: any, @Query() query: ExpenseListQueryDto, @Res() res: Response): Promise<void> {
    await this.service.exportList(request.srsContext, query, res)
  }

  @Get('analytics')
  analytics(@Req() request: any, @Query() query: ExpenseAnalyticsQueryDto) {
    return this.service.analytics(request.srsContext, query)
  }

  @Get('analytics/export')
  @ApiOkResponse({ description: 'XLSX: Report Info + la tabla de la solapa' })
  async analyticsExport(@Req() request: any, @Query() query: ExpenseAnalyticsQueryDto, @Res() res: Response): Promise<void> {
    await this.service.exportAnalytics(request.srsContext, query, res)
  }

  @Get('employees')
  employees(@Req() request: any, @Query() query: ExpenseEmployeesQueryDto) {
    return this.service.employees(request.srsContext, query)
  }
}
