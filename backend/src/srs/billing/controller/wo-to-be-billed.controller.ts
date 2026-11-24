import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'

import {
  WoToBeBilledConfigDto,
  WoToBeBilledConfigQueryDto,
  WoToBeBilledFilterDto,
  WoToBeBilledListQueryDto,
  WoToBeBilledListResponseDto,
  WoToBeBilledPreviewDto,
  WoToBeBilledSummaryDto,
} from '../dto/wo-to-be-billed.dto'
import { WoToBeBilledService } from '../service/wo-to-be-billed.service'

/** Billing › WO to be Billed: la lectura (plans/plan-wo-to-be-billed-v0, T4). Las escrituras van en los features. */
@Controller('/srs/billing/wo-to-be-billed')
@ApiTags('SRS Billing - WO to be Billed')
@ApiBearerAuth()
export class WoToBeBilledController {
  constructor(@Inject(WoToBeBilledService) private readonly service: WoToBeBilledService) {}

  @Get()
  @ApiOkResponse({ type: WoToBeBilledListResponseDto })
  list(@Req() request: any, @Query() query: WoToBeBilledListQueryDto): Promise<WoToBeBilledListResponseDto> {
    return this.service.list(request.srsContext, query)
  }

  @Get('/summary')
  @ApiOkResponse({ type: WoToBeBilledSummaryDto })
  summary(@Req() request: any, @Query() query: WoToBeBilledFilterDto): Promise<WoToBeBilledSummaryDto> {
    return this.service.summary(request.srsContext, query)
  }

  @Get('/config')
  @ApiOkResponse({ type: WoToBeBilledConfigDto })
  config(@Req() request: any, @Query() query: WoToBeBilledConfigQueryDto): Promise<WoToBeBilledConfigDto> {
    return this.service.config(request.srsContext, query.idDealer)
  }

  /** `POST` porque con cientos de WO tildadas la dirección de un `GET` no alcanza. No escribe. */
  @Post('/preview')
  @HttpCode(200)
  @ApiOkResponse({ type: WoToBeBilledPreviewDto })
  preview(@Req() request: any, @Body() body: WoToBeBilledFilterDto): Promise<WoToBeBilledPreviewDto> {
    return this.service.preview(request.srsContext, body)
  }
}
