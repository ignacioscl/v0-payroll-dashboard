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
import { ParametricDataService } from '../service/parametric-data.service'
import {
  ParametricDataDto,
  ParametricDataPaginationDto,
  ParametricDataQueryDto,
  UpdateParametricDataDto,
} from '../dto/parametric-data.dto'
import { ParametricData } from '../entity/parametric-data.entity'
import { RequestWithUser } from '../../../features/auth/types/request.user.type'
import { DataErrorDto } from 'src/commons/errors/data.error.dto'

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.ADMIN, RoleEnum.USER)
@Controller('/parametric-data')
@ApiTags('ParametricData')
@ApiBearerAuth()
export class ParametricDataController {
  constructor(@Inject(ParametricDataService) private readonly service: ParametricDataService) {}

  getService(): ParametricDataService {
    return this.service
  }

  @Get('/')
  @ApiOkResponse({ type: ParametricDataPaginationDto })
  async findAll(@Req() request: RequestWithUser, @Query() query: ParametricDataQueryDto) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { user } = request
    console.log('findAll.parametric-data', user)
    // If necessary, have the session ParametricData
    return await this.getService().fetch(query)
  }

  @Get('/permissions')
  @ApiOkResponse({ type: ParametricDataPaginationDto })
  async findPermissions(@Req() request: RequestWithUser, @Query() query: ParametricDataQueryDto) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { user } = request
    console.log('findAll.parametric-data', user)
    if (!query.idRole) {
      throw new BadRequestException('idRole is required')
    }
    // If necessary, have the session ParametricData
    return await this.getService().fetchPermissions(query)
  }

  @Get('/:id')
  @ApiOkResponse({ type: ParametricData, description: 'ParametricData detail' })
  @ApiNotFoundResponse({ description: 'ParametricData not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.getService().getById(id)
  }

  @Post('/')
  @ApiBody({ type: ParametricDataDto, required: true })
  @ApiCreatedResponse({ type: ParametricDataDto, description: 'ParametricData created' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error', type: DataErrorDto<ParametricDataDto> })
  @ApiBadRequestResponse({ description: 'Error al insertar ', type: DataErrorDto<ParametricDataDto> })
  async save(@Body() entity: ParametricDataDto) {
    return await this.getService().create(entity)
  }

  @Delete('/:id')
  @ApiNoContentResponse({ description: 'ParametricData deleted' })
  @ApiNotFoundResponse({ description: 'The ParametricData you want to delete does not exist' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Req() request: RequestWithUser, @Param('id', ParseIntPipe) id: number) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { user } = request
    await this.getService().deleteHardOrFail(id)
  }

  @Put('/:id')
  @ApiNoContentResponse({ description: 'ParametricData updated' })
  @ApiNotFoundResponse({ description: 'The ParametricData you want to update does not exist' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(@Param('id', ParseIntPipe) id: number, @Body() entity: UpdateParametricDataDto) {
    await this.getService().updateById(id, entity)
  }
}
