import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'

import { SrsJwtGuard } from 'src/srs/auth/srs-jwt.guard'
import {
  CreateRolesFromTemplateDto,
  CreateRolTemplateDto,
  RolTemplateQueryDto,
  SetRolTemplatePermissionsDto,
  UpdateRolTemplateDto,
} from '../dto/rol-template.dto'
import { RoleTemplateFacadeService } from '../service/role-template-facade.service'

@UseGuards(SrsJwtGuard)
@Controller('/srs/role-templates')
@ApiTags('SRS Role Templates')
@ApiBearerAuth()
export class RolTemplateController {
  constructor(
    @Inject(RoleTemplateFacadeService) private readonly service: RoleTemplateFacadeService,
  ) {}

  @Get()
  list(@Req() request: any, @Query() query: RolTemplateQueryDto) {
    return this.service.list(request.srsContext, query)
  }

  @Get(':id')
  get(@Req() request: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.get(request.srsContext, id)
  }

  @Post()
  create(@Req() request: any, @Body() body: CreateRolTemplateDto) {
    return this.service.create(request.srsContext, body)
  }

  @Put(':id')
  update(
    @Req() request: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateRolTemplateDto,
  ) {
    return this.service.update(request.srsContext, id, body)
  }

  @Delete(':id')
  remove(@Req() request: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(request.srsContext, id)
  }

  @Get(':id/permissions')
  listPermissions(@Req() request: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.listPermissions(request.srsContext, id)
  }

  @Get(':id/activity')
  listActivity(@Req() request: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.listActivity(request.srsContext, id)
  }

  @Put(':id/permissions')
  setPermissions(
    @Req() request: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SetRolTemplatePermissionsDto,
  ) {
    return this.service.setPermissions(request.srsContext, id, body)
  }

  @Get(':id/roles')
  listRoles(@Req() request: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.listRoles(request.srsContext, id)
  }

  @Post(':id/roles')
  createRoles(
    @Req() request: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CreateRolesFromTemplateDto,
  ) {
    return this.service.createRoles(request.srsContext, id, body)
  }

  @Delete(':id/roles/:idRol')
  deleteRole(
    @Req() request: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('idRol', ParseIntPipe) idRol: number,
  ) {
    return this.service.deleteRole(request.srsContext, id, idRol)
  }

  @Put(':id/roles/:idRol/estado')
  setRoleEstado(
    @Req() request: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('idRol', ParseIntPipe) idRol: number,
    @Body() body: { estado: number },
  ) {
    return this.service.setRoleEstado(request.srsContext, id, idRol, Number(body?.estado))
  }
}
