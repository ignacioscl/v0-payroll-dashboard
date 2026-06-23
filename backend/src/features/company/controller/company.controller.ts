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
import { CompanyService } from '../service/company.service'
import { CompanyDto, CompanyPaginationDto, CompanyQueryDto, UpdateCompanyDto } from '../dto/company.dto'
import { Company } from '../entity/company.entity'
import { RequestWithUser } from '../../../features/auth/types/request.user.type'
import { DataErrorDto } from 'src/commons/errors/data.error.dto'

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.ADMIN)
@Controller('companies')
@ApiTags('Company')
@ApiBearerAuth()
export class CompanyController {
  constructor(@Inject(CompanyService) private readonly service: CompanyService) {}

  getService(): CompanyService {
    return this.service
  }

  @Get('/')
  @ApiOkResponse({ type: CompanyPaginationDto })
  async findAll(@Req() request: RequestWithUser, @Query() query: CompanyQueryDto) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { user } = request
    //si es user
    //query.idCompany = user.idCompany
    // If necessary, have the session Company
    return await this.getService().fetch(query)
  }

  @Get('/:id')
  @ApiOkResponse({ type: Company, description: 'Company detail' })
  @ApiNotFoundResponse({ description: 'Company not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.getService().getById(id)
  }

  @Post('/')
  @ApiBody({ type: CompanyDto, required: true })
  @ApiCreatedResponse({ type: CompanyDto, description: 'Company created' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error', type: DataErrorDto<CompanyDto> })
  @ApiBadRequestResponse({ description: 'Error al insertar ', type: DataErrorDto<CompanyDto> })
  async save(@Body() entity: CompanyDto) {
    return await this.getService().create(entity)
  }

  @Delete('/:id')
  @ApiNoContentResponse({ description: 'Company deleted' })
  @ApiNotFoundResponse({ description: 'The Company you want to delete does not exist' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Req() request: RequestWithUser, @Param('id', ParseIntPipe) id: number) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { user } = request
    await this.getService().delete(id)
  }

  @Put('/:id')
  @ApiNoContentResponse({ description: 'Company updated' })
  @ApiNotFoundResponse({ description: 'The Company you want to update does not exist' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(@Param('id', ParseIntPipe) id: number, @Body() entity: UpdateCompanyDto) {
    await this.getService().updateById(id, entity)
  }
}
