import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'

import { SrsJwtGuard } from '../../auth/srs-jwt.guard'
import { SrsContext } from '../../auth/srs-auth-context.service'
import { PunchListService } from '../service/punch-list.service'
import { PunchListQueryDto, PunchListResponseDto } from '../dto/punch-list.dto'

@UseGuards(SrsJwtGuard)
@Controller('/srs/punch/list')
@ApiTags('SRS Punch - Individual list (keyset)')
@ApiBearerAuth()
export class PunchListController {
  constructor(@Inject(PunchListService) private readonly service: PunchListService) {}

  @Get('/')
  @ApiOkResponse({ type: PunchListResponseDto })
  async getList(
    @Req() request: { srsContext: SrsContext },
    @Query() query: PunchListQueryDto,
  ): Promise<PunchListResponseDto> {
    return this.service.getList(request.srsContext, query)
  }
}
