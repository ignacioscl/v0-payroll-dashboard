import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'

import { SrsJwtGuard } from 'src/srs/auth/srs-jwt.guard'
import { CompanyModuleGuard, RequireCompanyModule } from 'src/features/srs-contratista/guard/company-module.guard'
import {
  AddDealersDto,
  AssignDto,
  RemoveAssignDto,
} from 'src/features/srs-expense-dealer-assign/dto/expense-dealer-assign.dto'
import { RecurringListQueryDto, RecurringRuleDto, SplitTypeDto, UpdateRecurringRuleDto } from '../dto/expense-repetitive.dto'
import { RecurringExpenseFacadeService } from '../service/recurring-expense-facade.service'

/** Expenses › Recurring Expenses (contrato en plans/plan-expenses-pro/AVANCE.md). Todo con 111. */
@UseGuards(SrsJwtGuard, CompanyModuleGuard)
@RequireCompanyModule('expenses')
@Controller('/srs/expenses/recurring')
@ApiTags('SRS Expenses - Recurring')
@ApiBearerAuth()
export class RecurringExpenseController {
  constructor(@Inject(RecurringExpenseFacadeService) private readonly service: RecurringExpenseFacadeService) {}

  @Get()
  list(@Req() request: any, @Query() query: RecurringListQueryDto) {
    return this.service.list(request.srsContext, query)
  }

  @Get(':id(\\d+)')
  get(@Req() request: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.get(request.srsContext, id)
  }

  @Post()
  create(@Req() request: any, @Body() body: RecurringRuleDto) {
    return this.service.create(request.srsContext, body)
  }

  @Put(':id(\\d+)')
  update(@Req() request: any, @Param('id', ParseIntPipe) id: number, @Body() body: UpdateRecurringRuleDto) {
    return this.service.update(request.srsContext, id, body)
  }

  @Delete(':id(\\d+)')
  @HttpCode(204)
  async remove(@Req() request: any, @Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.service.remove(request.srsContext, id)
  }

  @Put(':id(\\d+)/split')
  changeSplit(@Req() request: any, @Param('id', ParseIntPipe) id: number, @Body() body: SplitTypeDto) {
    return this.service.changeSplitType(request.srsContext, id, body)
  }

  @Post(':id(\\d+)/dealers')
  addDealers(@Req() request: any, @Param('id', ParseIntPipe) id: number, @Body() body: AddDealersDto) {
    return this.service.addDealers(request.srsContext, id, body)
  }

  @Put(':id(\\d+)/dealers/:idAssign(\\d+)')
  editAssign(
    @Req() request: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('idAssign', ParseIntPipe) idAssign: number,
    @Body() body: AssignDto,
  ) {
    return this.service.editAssign(request.srsContext, id, idAssign, body)
  }

  /** `allowAnyTotal` en el body (JSON) o, si el cliente no manda body en DELETE, en la query. */
  @Delete(':id(\\d+)/dealers/:idAssign(\\d+)')
  removeAssign(
    @Req() request: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('idAssign', ParseIntPipe) idAssign: number,
    @Body() body: RemoveAssignDto,
    @Query() query: RemoveAssignDto,
  ) {
    return this.service.removeAssign(request.srsContext, id, idAssign, body?.allowAnyTotal === true || query?.allowAnyTotal === true)
  }

  @Get(':id(\\d+)/dealers/export')
  @ApiOkResponse({ description: 'XLSX: Report Info + Dealers (Dealer ID, Dealer, Mode, Percent, Amount)' })
  async exportDealers(@Req() request: any, @Param('id', ParseIntPipe) id: number, @Res() res: Response): Promise<void> {
    await this.service.exportDealers(request.srsContext, id, res)
  }
}
