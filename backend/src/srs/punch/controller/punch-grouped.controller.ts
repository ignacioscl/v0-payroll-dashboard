import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'

import { SrsJwtGuard } from '../../auth/srs-jwt.guard'
import { SrsContext } from '../../auth/srs-auth-context.service'
import { GroupedPunchService } from '../service/punch-grouped.service'
import { PunchGroupedQueryDto, PunchGroupedResponseDto } from '../dto/punch-grouped.dto'

@UseGuards(SrsJwtGuard)
@Controller('/srs/punch/grouped')
@ApiTags('SRS Punch - Grouped by employee')
@ApiBearerAuth()
export class GroupedPunchController {
  constructor(@Inject(GroupedPunchService) private readonly service: GroupedPunchService) {}

  @Get('/')
  @ApiOkResponse({ type: PunchGroupedResponseDto })
  async getGrouped(
    @Req() request: { srsContext: SrsContext },
    @Query() query: PunchGroupedQueryDto,
  ): Promise<PunchGroupedResponseDto> {
    return this.service.getGrouped(request.srsContext, query)
  }
}
