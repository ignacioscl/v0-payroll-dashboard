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
import { GeneralDataService } from '../service/general-data.service'
import {
  GeneralDataDto,
  GeneralDataPaginationDto,
  GeneralDataQueryDto,
  UpdateGeneralDataDto,
} from '../dto/general-data.dto'
import { GeneralData } from '../entity/general-data.entity'
import { RequestWithUser } from '../../../features/auth/types/request.user.type'
import { DataErrorDto } from 'src/commons/errors/data.error.dto'
import { I18nError } from 'src/commons/errors/i18n.error'

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.ADMIN)
@Controller('/general-data')
@ApiTags('GeneralData')
@ApiBearerAuth()
export class GeneralDataController {
  constructor(@Inject(GeneralDataService) private readonly service: GeneralDataService) {}

  getService(): GeneralDataService {
    return this.service
  }

  @Get('/')
  @ApiOkResponse({ type: GeneralDataPaginationDto })
  async findAll(@Req() request: RequestWithUser, @Query() query: GeneralDataQueryDto) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { user } = request
    // If necessary, have the session GeneralData
    return await this.getService().fetch(query)
  }

  @Get('/:id')
  @ApiOkResponse({ type: GeneralData, description: 'GeneralData detail' })
  @ApiNotFoundResponse({ description: 'GeneralData not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.getService().getById(id)
  }

  @Post('/')
  @ApiBody({ type: GeneralDataDto, required: true })
  @ApiCreatedResponse({ type: GeneralDataDto, description: 'GeneralData created' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error', type: DataErrorDto<GeneralDataDto> })
  @ApiBadRequestResponse({ description: 'Error al insertar ', type: DataErrorDto<GeneralDataDto> })
  async save(@Body() entity: GeneralDataDto) {
    return await this.getService().create(entity)
  }

  @Post('/paymentMethod')
  @ApiBody({ type: GeneralDataDto, required: true })
  @ApiCreatedResponse({ type: GeneralDataDto, description: 'GeneralData created' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error', type: DataErrorDto<GeneralDataDto> })
  @ApiBadRequestResponse({ description: 'Error al insertar ', type: DataErrorDto<GeneralDataDto> })
  async savePaymentMethod(@Body() entity: GeneralDataDto) {
    if (entity.idCategory < 6 || entity.idCategory > 11) {
      throw new I18nError('error.validation.invalidCategory', HttpStatus.BAD_REQUEST)
    }
    return await this.getService().updateOrCreatePaymentMethodByUser(entity)
  }

  @Delete('/:id')
  @ApiNoContentResponse({ description: 'GeneralData deleted' })
  @ApiNotFoundResponse({ description: 'The GeneralData you want to delete does not exist' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Req() request: RequestWithUser, @Param('id', ParseIntPipe) id: number) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { user } = request
    await this.getService().delete(id)
  }

  @Put('/:id')
  @ApiNoContentResponse({ description: 'GeneralData updated' })
  @ApiNotFoundResponse({ description: 'The GeneralData you want to update does not exist' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(@Param('id', ParseIntPipe) id: number, @Body() entity: UpdateGeneralDataDto) {
    delete entity.idCategory

    await this.getService().updateById(id, entity)
  }
}
