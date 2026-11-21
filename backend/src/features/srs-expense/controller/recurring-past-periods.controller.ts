import { Controller, Get, HttpCode, Inject, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'

import { CompanyModuleGuard, RequireCompanyModule } from 'src/features/srs-contratista/guard/company-module.guard'
import { RecurringPastPeriodsService } from '../service/recurring-past-periods.service'

/**
 * Tema 1 de plan-reunion-juan-18-11: «Past periods» de una regla recurrente (vista previa y grabado). Misma ruta que
 * Recurring (`recurring-expense.controller.ts`); vive en el módulo de gastos porque los graba.
 */
@UseGuards(CompanyModuleGuard)
@RequireCompanyModule('expenses')
@Controller('/srs/expenses/recurring')
@ApiTags('SRS Expenses - Recurring')
@ApiBearerAuth()
export class RecurringPastPeriodsController {
  constructor(@Inject(RecurringPastPeriodsService) private readonly service: RecurringPastPeriodsService) {}

  @Get(':id(\\d+)/past-periods')
  preview(@Req() request: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.preview(request.srsContext, id)
  }

  @Post(':id(\\d+)/past-periods')
  @HttpCode(200)
  generate(@Req() request: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.generate(request.srsContext, id)
  }
}
