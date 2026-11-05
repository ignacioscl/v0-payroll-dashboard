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
  Req,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'

import { SrsJwtGuard } from 'src/srs/auth/srs-jwt.guard'
import { CompanyModuleGuard, RequireCompanyModule } from 'src/features/srs-contratista/guard/company-module.guard'
import { ApprovalDto, AttachmentLogDto, CreateExpenseDto, UpdateExpenseDto } from '../dto/expense.dto'
import { ExpenseFacadeService } from '../service/expense-facade.service'

/**
 * Un gasto (o su grupo): detalle, alta, edición, aprobación, baja, restauración y log. Rutas con id numérico
 * (`':id(\\d+)'`), así `companies`, `summary`, `recurring`, `analytics` y `employees` nunca caen acá.
 */
@UseGuards(SrsJwtGuard, CompanyModuleGuard)
@RequireCompanyModule('expenses')
@Controller('/srs/expenses')
@ApiTags('SRS Expenses')
@ApiBearerAuth()
export class ExpenseController {
  constructor(@Inject(ExpenseFacadeService) private readonly service: ExpenseFacadeService) {}

  @Get(':id(\\d+)')
  get(@Req() request: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.get(request.srsContext, id)
  }

  @Post()
  create(@Req() request: any, @Body() body: CreateExpenseDto) {
    return this.service.create(request.srsContext, body)
  }

  @Put(':id(\\d+)')
  update(@Req() request: any, @Param('id', ParseIntPipe) id: number, @Body() body: UpdateExpenseDto) {
    return this.service.update(request.srsContext, id, body)
  }

  @Put(':id(\\d+)/approval')
  setApproval(@Req() request: any, @Param('id', ParseIntPipe) id: number, @Body() body: ApprovalDto) {
    return this.service.setApproval(request.srsContext, id, body)
  }

  @Put('groups/:id(\\d+)/approval')
  setGroupApproval(@Req() request: any, @Param('id', ParseIntPipe) id: number, @Body() body: ApprovalDto) {
    return this.service.setGroupApproval(request.srsContext, id, body)
  }

  @Delete(':id(\\d+)')
  @HttpCode(204)
  async remove(@Req() request: any, @Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.service.remove(request.srsContext, id)
  }

  @Delete('groups/:id(\\d+)')
  @HttpCode(204)
  async removeGroup(@Req() request: any, @Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.service.removeGroup(request.srsContext, id)
  }

  @Post(':id(\\d+)/restore')
  restore(@Req() request: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.restore(request.srsContext, id)
  }

  @Post('groups/:id(\\d+)/restore')
  restoreGroup(@Req() request: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.restoreGroup(request.srsContext, id)
  }

  /** El BFF de adjuntos lo llama antes de mandar el archivo al Node: sin 204 no sube nada. */
  @Post(':id(\\d+)/attachment-check')
  @HttpCode(204)
  async checkAttachment(@Req() request: any, @Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.service.assertCanAttach(request.srsContext, id)
  }

  /** El BFF de adjuntos lo llama después de un 200 del Node: deja «Attachment {filename}» en el log (hasAttachment). */
  @Post(':id(\\d+)/attachment-log')
  @HttpCode(204)
  async logAttachment(@Req() request: any, @Param('id', ParseIntPipe) id: number, @Body() body: AttachmentLogDto): Promise<void> {
    await this.service.logAttachment(request.srsContext, id, body)
  }

  @Get(':id(\\d+)/log')
  log(@Req() request: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.log(request.srsContext, id)
  }
}
