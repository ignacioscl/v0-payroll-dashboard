import { Body, Controller, HttpCode, Inject, Param, ParseIntPipe, Post, Put, Req } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'

import {
  DeleteWorkOrdersDto,
  DeleteWorkOrdersResponseDto,
  UpdateWorkOrderRoPoDto,
  WorkOrderRoPoResponseDto,
} from '../dto/work-order.dto'
import { WorkOrderFacadeService } from '../service/work-order-facade.service'

/**
 * Billing › WO to be Billed: eliminar WO y RO# / PO# (plans/plan-wo-to-be-billed-v0, T5 y T6). `POST` y `PUT`: el
 * proxy del front (`/api/srs-kpis/[...path]`) no reenvía `PATCH`.
 */
@Controller('/srs/billing/work-orders')
@ApiTags('SRS Billing - Work Orders')
@ApiBearerAuth()
export class WorkOrderController {
  constructor(@Inject(WorkOrderFacadeService) private readonly facade: WorkOrderFacadeService) {}

  /** Siempre 200 con el resultado por WO (D11), también con una sola. */
  @Post('/delete')
  @HttpCode(200)
  @ApiOkResponse({ type: DeleteWorkOrdersResponseDto })
  delete(@Req() request: any, @Body() body: DeleteWorkOrdersDto): Promise<DeleteWorkOrdersResponseDto> {
    return this.facade.delete(request.srsContext, body)
  }

  @Put('/:idInvoice/ro-po')
  @ApiOkResponse({ type: WorkOrderRoPoResponseDto })
  updateRoPo(
    @Req() request: any,
    @Param('idInvoice', ParseIntPipe) idInvoice: number,
    @Body() body: UpdateWorkOrderRoPoDto,
  ): Promise<WorkOrderRoPoResponseDto> {
    return this.facade.updateRoPo(request.srsContext, idInvoice, body)
  }
}
