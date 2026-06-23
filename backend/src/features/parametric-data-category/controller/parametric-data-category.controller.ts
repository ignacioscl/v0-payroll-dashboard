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
import { ParametricDataCategoryService } from '../service/parametric-data-category.service'
import {
  ParametricDataCategoryDto,
  ParametricDataCategoryPaginationDto,
  ParametricDataCategoryQueryDto,
  UpdateParametricDataCategoryDto,
} from '../dto/parametric-data-category.dto'
import { ParametricDataCategory } from '../entity/parametric-data-category.entity'
import { RequestWithUser } from '../../../features/auth/types/request.user.type'
import { DataErrorDto } from 'src/commons/errors/data.error.dto'

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.ADMIN)
@Controller('/parametric-data-category')
@ApiTags('ParametricDataCategory')
@ApiBearerAuth()
export class ParametricDataCategoryController {
  constructor(@Inject(ParametricDataCategoryService) private readonly service: ParametricDataCategoryService) {}

  getService(): ParametricDataCategoryService {
    return this.service
  }

  @Get('/')
  @ApiOkResponse({ type: ParametricDataCategoryPaginationDto })
  async findAll(@Req() request: RequestWithUser, @Query() query: ParametricDataCategoryQueryDto) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { user } = request
    // If necessary, have the session ParametricDataCategory
    return await this.getService().fetch(query)
  }

  @Get('/:id')
  @ApiOkResponse({ type: ParametricDataCategory, description: 'ParametricDataCategory detail' })
  @ApiNotFoundResponse({ description: 'ParametricDataCategory not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.getService().getById(id)
  }

  @Post('/')
  @ApiBody({ type: ParametricDataCategoryDto, required: true })
  @ApiCreatedResponse({ type: ParametricDataCategoryDto, description: 'ParametricDataCategory created' })
  @ApiInternalServerErrorResponse({
    description: 'Internal server error',
    type: DataErrorDto<ParametricDataCategoryDto>,
  })
  @ApiBadRequestResponse({ description: 'Error al insertar ', type: DataErrorDto<ParametricDataCategoryDto> })
  async save(@Body() entity: ParametricDataCategoryDto) {
    return await this.getService().create(entity)
  }

  @Delete('/:id')
  @ApiNoContentResponse({ description: 'ParametricDataCategory deleted' })
  @ApiNotFoundResponse({ description: 'The ParametricDataCategory you want to delete does not exist' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Req() request: RequestWithUser, @Param('id', ParseIntPipe) id: number) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { user } = request
    await this.getService().deleteHardOrFail(id, '{ID_COL_PK}')
  }

  @Put('/:id')
  @ApiNoContentResponse({ description: 'ParametricDataCategory updated' })
  @ApiNotFoundResponse({ description: 'The ParametricDataCategory you want to update does not exist' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(@Param('id', ParseIntPipe) id: number, @Body() entity: UpdateParametricDataCategoryDto) {
    await this.getService().updateByIdCustom(id, '{ID_COL_PK}', entity)
  }
}
