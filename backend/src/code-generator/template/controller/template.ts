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

import { SrsContext } from 'src/srs/auth/srs-auth-context.service'
import { SrsJwtGuard } from 'src/srs/auth/srs-jwt.guard'
import { DataErrorDto } from 'src/commons/errors/data.error.dto'
import { TemplateService } from '../service/template'
import { TemplateDto, TemplatePaginationDto, TemplateQueryDto, UpdateTemplateDto } from '../dto/template'
import { Template } from '../entity/template'

/** Auth de PRO: el JWT de PHP lo valida SrsJwtGuard, que deja el usuario en request.srsContext. */
@UseGuards(SrsJwtGuard)
@Controller('/srs/template')
@ApiTags('Template')
@ApiBearerAuth()
export class TemplateController {
  constructor(@Inject(TemplateService) private readonly service: TemplateService) {}

  getService(): TemplateService {
    return this.service
  }

  @Get('/')
  @ApiOkResponse({ type: TemplatePaginationDto })
  async findAll(@Req() request: { srsContext: SrsContext }, @Query() query: TemplateQueryDto) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { srsContext } = request
    // Si hace falta, filtrar por srsContext.idDealerProvider (empresa del usuario)
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
  async delete(@Req() request: { srsContext: SrsContext }, @Param('id', ParseIntPipe) id: number) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { srsContext } = request
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
