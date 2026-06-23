import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'

import { SrsJwtGuard } from '../../auth/srs-jwt.guard'
import { SrsKpiQueryDto } from '../../shared/kpi/srs-kpi-query.dto'

import { PayrollKpiService } from '../service/payroll-kpi.service'
import { PayrollByTypeRowDto, PayrollKpiDto } from '../dto/payroll-kpi.dto'

@UseGuards(SrsJwtGuard)
@Controller('/srs/kpis/payroll')
@ApiTags('SRS KPIs - Payroll')
@ApiBearerAuth()
export class PayrollKpiController {
  constructor(@Inject(PayrollKpiService) private readonly service: PayrollKpiService) {}

  @Get('/')
  @ApiOkResponse({ type: PayrollKpiDto })
  async getPayrollKpis(
    @Req() request: any,
    @Query() query: SrsKpiQueryDto,
  ): Promise<PayrollKpiDto> {
    return this.service.getPayrollKpis(request.srsContext, query)
  }

  @Get('/by-type')
  @ApiOkResponse({ type: [PayrollByTypeRowDto] })
  async getPayrollByType(
    @Req() request: any,
    @Query() query: SrsKpiQueryDto,
  ): Promise<PayrollByTypeRowDto[]> {
    return this.service.getPayrollByType(request.srsContext, query)
  }
}
