import { Body, Controller, HttpCode, Inject, Param, ParseIntPipe, Post, Req } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'

import { WoToBeBilledFilterDto } from 'src/srs/billing/dto/wo-to-be-billed.dto'
import {
  CreatedWoInvoiceDto,
  GenerateIndividualInvoiceDto,
  GenerateWoInvoicesResponseDto,
} from '../dto/invoice-statement.dto'
import { WoInvoiceFacadeService } from '../service/wo-invoice-facade.service'

/** Billing › WO to be Billed: Generate Invoice y Generate Individual Invoice (plans/plan-wo-to-be-billed-v0, T3). */
@Controller('/srs/billing/wo-to-be-billed')
@ApiTags('SRS Billing - WO to be Billed')
@ApiBearerAuth()
export class WoInvoiceController {
  constructor(@Inject(WoInvoiceFacadeService) private readonly facade: WoInvoiceFacadeService) {}

  /** El filtro de la pantalla (la misma clase que la lista) + `invoiceType` + `woIds`. */
  @Post('/generate')
  @HttpCode(200)
  @ApiOkResponse({ type: GenerateWoInvoicesResponseDto })
  generate(@Req() request: any, @Body() body: WoToBeBilledFilterDto): Promise<GenerateWoInvoicesResponseDto> {
    return this.facade.generate(request.srsContext, body)
  }

  @Post('/:idInvoice/individual')
  @HttpCode(200)
  @ApiOkResponse({ type: CreatedWoInvoiceDto })
  individual(
    @Req() request: any,
    @Param('idInvoice', ParseIntPipe) idInvoice: number,
    @Body() body: GenerateIndividualInvoiceDto,
  ): Promise<CreatedWoInvoiceDto> {
    return this.facade.generateIndividual(request.srsContext, idInvoice, body)
  }
}
