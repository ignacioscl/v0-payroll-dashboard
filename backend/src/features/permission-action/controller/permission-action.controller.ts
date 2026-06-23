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
import { PermissionActionService } from '../service/permission-action.service'
import {
  PermissionActionDto,
  PermissionActionPaginationDto,
  PermissionActionQueryDto,
  UpdatePermissionActionDto,
} from '../dto/permission-action.dto'
import { PermissionAction } from '../entity/permission-action.entity'
import { RequestWithUser } from '../../../features/auth/types/request.user.type'
import { DataErrorDto } from 'src/commons/errors/data.error.dto'

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.ADMIN)
@Controller('/permission-action')
@ApiTags('PermissionAction')
@ApiBearerAuth()
export class PermissionActionController {
  constructor(@Inject(PermissionActionService) private readonly service: PermissionActionService) {}

  getService(): PermissionActionService {
    return this.service
  }

  @Get('/')
  @ApiOkResponse({ type: PermissionActionPaginationDto })
  async findAll(@Req() request: RequestWithUser, @Query() query: PermissionActionQueryDto) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { user } = request
    // If necessary, have the session PermissionAction
    return await this.getService().fetch(query)
  }

  @Get('/:id')
  @ApiOkResponse({ type: PermissionAction, description: 'PermissionAction detail' })
  @ApiNotFoundResponse({ description: 'PermissionAction not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.getService().getById(id)
  }

  @Post('/')
  @ApiBody({ type: PermissionActionDto, required: true })
  @ApiCreatedResponse({ type: PermissionActionDto, description: 'PermissionAction created' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error', type: DataErrorDto<PermissionActionDto> })
  @ApiBadRequestResponse({ description: 'Error al insertar ', type: DataErrorDto<PermissionActionDto> })
  async save(@Body() entity: PermissionActionDto) {
    return await this.getService().create(entity)
  }

  @Delete('/:id')
  @ApiNoContentResponse({ description: 'PermissionAction deleted' })
  @ApiNotFoundResponse({ description: 'The PermissionAction you want to delete does not exist' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Req() request: RequestWithUser, @Param('id', ParseIntPipe) id: number) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { user } = request
    await this.getService().deleteHardOrFail(id)
  }

  @Put('/:id')
  @ApiNoContentResponse({ description: 'PermissionAction updated' })
  @ApiNotFoundResponse({ description: 'The PermissionAction you want to update does not exist' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(@Param('id', ParseIntPipe) id: number, @Body() entity: UpdatePermissionActionDto) {
    await this.getService().updateById(id, entity)
  }
}
