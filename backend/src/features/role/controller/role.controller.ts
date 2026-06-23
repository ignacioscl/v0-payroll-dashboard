import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger'

import { Roles } from '../../../commons/decorator/role.decorator'
import { RoleEnum } from '../../../commons/enum/role.enum'
import { JwtAuthGuard } from '../../../features/auth/guard/jwt.guard'
import { RolesGuard } from '../../../features/auth/guard/role.guard'
import { RoleService } from '../service/role.service'
import { RoleDto, RolePaginationDto, RoleQueryDto, UpdateRoleDto } from '../dto/role.dto'
import { Role as RoleEntity } from '../entity/role.entity'
import { RequestWithUser } from '../../../features/auth/types/request.user.type'
import { DataErrorDto } from 'src/commons/errors/data.error.dto'

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('/roles')
@ApiTags('Role')
@ApiBearerAuth()
export class RoleController {
  constructor(@Inject(RoleService) private readonly service: RoleService) {}

  getService(): RoleService {
    return this.service
  }

  @Get('/')
  @ApiOkResponse({ type: RolePaginationDto })
  async findAll(@Req() request: RequestWithUser, @Query() query: RoleQueryDto) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { user } = request
    console.log('findAll.user', user)
    //TODO: Verificar si el usuario tiene acceso a la compañía
    if (user.role != RoleEnum.ADMIN) {
      query.idCompany = user.idCompany
    } else {
      query.idCompany = undefined
    }
    // If necessary, have the session Role
    return await this.getService().fetch(query)
  }

  @Get('/:id')
  @ApiOkResponse({ type: RoleEntity, description: 'Role detail' })
  @ApiNotFoundResponse({ description: 'Role not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.getService().getById(id)
  }

  @Post('/')
  @ApiBody({ type: RoleDto, required: true })
  @ApiCreatedResponse({ type: RoleDto, description: 'Role created' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error', type: DataErrorDto<RoleDto> })
  @ApiBadRequestResponse({ description: 'Error al insertar ', type: DataErrorDto<RoleDto> })
  async save(@Req() request: RequestWithUser, @Body() entity: RoleDto) {
    const { user, company } = request
    // company desde x-company-token: si tiene parent (filial) usar parent.id; si no (raíz) usar company.id
    const idCompany = company?.parent?.id ?? company?.id ?? user?.idCompany
    if (idCompany == null) {
      throw new BadRequestException(
        'Company context is required. Send x-company-token header or ensure the user has a default company.',
      )
    }
    ;(entity as RoleEntity).idCompany = idCompany
    return await this.getService().customCreate(entity as RoleEntity)
  }

  @Delete('/:id')
  @ApiNoContentResponse({ description: 'Role deleted' })
  @ApiNotFoundResponse({ description: 'The Role you want to delete does not exist' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Req() request: RequestWithUser, @Param('id', ParseIntPipe) id: number) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { user } = request
    await this.getService().delete(id)
  }

  @Put('/:id')
  @ApiNoContentResponse({ description: 'Role updated' })
  @ApiNotFoundResponse({ description: 'The Role you want to update does not exist' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(@Param('id', ParseIntPipe) id: number, @Body() entity: UpdateRoleDto) {
    await this.getService().customUpdate(id, entity)
  }
}
