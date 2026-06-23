import {
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
import { RolePermissionActionService } from '../service/role-permission-action.service'
import {
  RolePermissionActionDto,
  RolePermissionActionPaginationDto,
  RolePermissionActionQueryDto,
  UpdateRolePermissionActionDto,
} from '../dto/role-permission-action.dto'
import { RolePermissionAction } from '../entity/role-permission-action.entity'
import { RequestWithUser } from '../../../features/auth/types/request.user.type'
import { DataErrorDto } from 'src/commons/errors/data.error.dto'

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.ADMIN)
@Controller('/role-permission-action')
@ApiTags('RolePermissionAction')
@ApiBearerAuth()
export class RolePermissionActionController {
  constructor(@Inject(RolePermissionActionService) private readonly service: RolePermissionActionService) {}

  getService(): RolePermissionActionService {
    return this.service
  }

  @Get('/')
  @ApiOkResponse({ type: RolePermissionActionPaginationDto })
  async findAll(@Req() request: RequestWithUser, @Query() query: RolePermissionActionQueryDto) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { user } = request
    // If necessary, have the session RolePermissionAction
    return await this.getService().fetch(query)
  }

  @Get('/:id')
  @ApiOkResponse({ type: RolePermissionAction, description: 'RolePermissionAction detail' })
  @ApiNotFoundResponse({ description: 'RolePermissionAction not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.getService().getById(id)
  }

  @Post('/')
  @ApiBody({ type: RolePermissionActionDto, required: true })
  @ApiCreatedResponse({ type: RolePermissionActionDto, description: 'RolePermissionAction created' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error', type: DataErrorDto<RolePermissionActionDto> })
  @ApiBadRequestResponse({ description: 'Error al insertar ', type: DataErrorDto<RolePermissionActionDto> })
  async save(@Body() entity: RolePermissionActionDto) {
    return await this.getService().create(entity)
  }

  @Delete('/:idRole/:idPermissionAction')
  @ApiNoContentResponse({ description: 'RolePermissionAction deleted' })
  @ApiNotFoundResponse({ description: 'The RolePermissionAction you want to delete does not exist' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Req() request: RequestWithUser,
    @Param('idRole', ParseIntPipe) idRole: number,
    @Param('idPermissionAction', ParseIntPipe) idPermissionAction: number,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { user } = request
    await this.getService().deleteByIdRoleAndIdPermissionAction(idRole, idPermissionAction)
  }

  @Put('/:id')
  @ApiNoContentResponse({ description: 'RolePermissionAction updated' })
  @ApiNotFoundResponse({ description: 'The RolePermissionAction you want to update does not exist' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(@Param('id', ParseIntPipe) id: number, @Body() entity: UpdateRolePermissionActionDto) {
    await this.getService().updateById(id, entity)
  }
}
