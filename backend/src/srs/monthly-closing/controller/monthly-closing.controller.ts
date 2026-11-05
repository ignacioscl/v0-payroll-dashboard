import { Controller, Get, Inject, Param, ParseIntPipe, Query, Req, Res, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'

import { SrsJwtGuard } from '../../auth/srs-jwt.guard'
import { MonthlyClosingDealerDto, MonthlyClosingDto, MonthlyClosingQueryDto } from '../dto/monthly-closing.dto'
import { MonthlyClosingService } from '../service/monthly-closing.service'

/**
 * Reports › Monthly Closing y Reports › Window Tint Closing (`scope=tint`). T4 de plans/plan-monthly-closing/PLAN.md.
 * `/export` va antes de `/dealer/:idDealer` solo por orden de lectura: las rutas no se pisan.
 */
@UseGuards(SrsJwtGuard)
@Controller('/srs/reports/monthly-closing')
@ApiTags('SRS Reports - Monthly Closing')
@ApiBearerAuth()
export class MonthlyClosingController {
  constructor(@Inject(MonthlyClosingService) private readonly service: MonthlyClosingService) {}

  @Get('/')
  @ApiOkResponse({ type: MonthlyClosingDto })
  async getSummary(@Req() request: any, @Query() query: MonthlyClosingQueryDto): Promise<MonthlyClosingDto> {
    return this.service.getSummary(request.srsContext, query)
  }

  @Get('/export')
  @ApiOkResponse({ description: 'XLSX: Report Info, Summary, (By service), Income, Payroll, Expenses' })
  async export(@Req() request: any, @Query() query: MonthlyClosingQueryDto, @Res() res: Response): Promise<void> {
    await this.service.export(request.srsContext, query, res)
  }

  /** `:idDealer = 0` = Without dealer (solo Payroll, solo Admin General y Admin Company). */
  @Get('/dealer/:idDealer')
  @ApiOkResponse({ type: MonthlyClosingDealerDto })
  async getDealer(
    @Req() request: any,
    @Param('idDealer', ParseIntPipe) idDealer: number,
    @Query() query: MonthlyClosingQueryDto,
  ): Promise<MonthlyClosingDealerDto> {
    return this.service.getDealer(request.srsContext, idDealer, query)
  }
}
