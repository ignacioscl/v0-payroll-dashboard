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
import { TemplateService } from '../service/template'
import { TemplateDto, TemplatePaginationDto, TemplateQueryDto, UpdateTemplateDto } from '../dto/template'
import { Template } from '../entity/template'
import { RequestWithUser } from '../../../features/auth/types/request.user.type'
import { DataErrorDto } from 'src/commons/errors/data.error.dto'

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.ADMIN)
@Controller('/api-documentos/template')
@ApiTags('Template')
@ApiBearerAuth()
export class TemplateController {
  constructor(@Inject(TemplateService) private readonly service: TemplateService) {}

  getService(): TemplateService {
    return this.service
  }

  @Get('/')
  @ApiOkResponse({ type: TemplatePaginationDto })
  async findAll(@Req() request: RequestWithUser, @Query() query: TemplateQueryDto) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { user } = request
    // If necessary, have the session Template
    return await this.getService().fetch(query)
  }

  @Get('/:id')
  @ApiOkResponse({ type: Template, description: 'Template detail' })
  @ApiNotFoundResponse({ description: 'Template not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.getService().getById(id)
  }

  @Post('/')
  @ApiBody({ type: TemplateDto, required: true })
  @ApiCreatedResponse({ type: TemplateDto, description: 'Template created' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error', type: DataErrorDto<TemplateDto> })
  @ApiBadRequestResponse({ description: 'Error al insertar ', type: DataErrorDto<TemplateDto> })
  async save(@Body() entity: TemplateDto) {
    return await this.getService().create(entity)
  }

  @Delete('/:id')
  @ApiNoContentResponse({ description: 'Template deleted' })
  @ApiNotFoundResponse({ description: 'The Template you want to delete does not exist' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Req() request: RequestWithUser, @Param('id', ParseIntPipe) id: number) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { user } = request
    await this.getService().delete(id)
  }

  @Put('/:id')
  @ApiNoContentResponse({ description: 'Template updated' })
  @ApiNotFoundResponse({ description: 'The Template you want to update does not exist' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(@Param('id', ParseIntPipe) id: number, @Body() entity: UpdateTemplateDto) {
    await this.getService().updateById(id, entity)
  }
}
