import { Body, Controller, Get, Inject, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'

import { SrsJwtGuard } from 'src/srs/auth/srs-jwt.guard'
import { SetSrsRolPermissionsDto } from '../dto/srs-rol.dto'
import { SrsRolFacadeService } from '../service/srs-rol-facade.service'

@UseGuards(SrsJwtGuard)
@Controller('/srs/roles')
@ApiTags('SRS Roles')
@ApiBearerAuth()
export class SrsRolController {
  constructor(@Inject(SrsRolFacadeService) private readonly service: SrsRolFacadeService) {}

  @Post(':idRol/permissions')
  setPermissions(
    @Req() request: any,
    @Param('idRol', ParseIntPipe) idRol: number,
    @Body() body: SetSrsRolPermissionsDto,
  ) {
    return this.service.setPermissions(request.srsContext, idRol, body)
  }

  @Get(':idRol/activity')
  listActivity(@Req() request: any, @Param('idRol', ParseIntPipe) idRol: number) {
    return this.service.listActivity(request.srsContext, idRol)
  }
}
