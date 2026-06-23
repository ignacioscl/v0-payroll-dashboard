import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common'
import { Response } from 'express'
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger'

import { IdParams } from '../../../commons/dto/Commons.dto'
import {
  UpdateUserDto,
  UserDto,
  UserPaginationDto,
  UserQueryDto,
  ChangePasswordDto,
  UserPatientDto,
} from '../dto/user.dto'
import { UserService } from '../service/user.service'
import { User } from '../entity/user.entity'
import { SerializerInterceptor } from '../interceptor/user.interceptor'
import { Roles } from '../../../commons/decorator/role.decorator'
import { RoleEnum } from '../../../commons/enum/role.enum'
import { JwtAuthGuard } from '../../auth/guard/jwt.guard'
import { RolesGuard } from '../../auth/guard/role.guard'
import { RequestWithUser } from '../../auth/types/request.user.type'
import { I18nError } from 'src/commons/errors/i18n.error'

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('/users')
@ApiTags('Users')
@ApiBearerAuth()
@UseInterceptors(SerializerInterceptor)
export class UserController {
  constructor(@Inject(UserService) private readonly userService: UserService) {}

  getService(): UserService {
    return this.userService
  }

  @Get('/')
  @ApiOkResponse({ type: UserPaginationDto })
  async findAll(@Req() request: RequestWithUser, @Query() query: UserQueryDto) {
    const { user } = request
    // Esperar 10 segundos antes de continuar
    //await new Promise(resolve => setTimeout(resolve, 3000))
    //throw new I18nError('error.service.timeout', HttpStatus.INTERNAL_SERVER_ERROR)
    return this.getService().findWithFiltersAndPagination(query, user as User)
  }

  @Get('/patients')
  @ApiOkResponse({ type: UserPaginationDto })
  async findAllPatients(@Req() request: RequestWithUser, @Query() query: UserQueryDto) {
    const { user } = request

    console.log('🏥 Patient Endpoint - Company from interceptor:', request.company)
    console.log('🏥 Patient Endpoint - Full request object:', {
      headers: request.headers,
      body: query,
      company: request.company,
      user: user,
    })
    // Esperar 10 segundos antes de continuar
    //await new Promise(resolve => setTimeout(resolve, 3000))
    //throw new I18nError('error.service.timeout', HttpStatus.INTERNAL_SERVER_ERROR)
    return this.getService().findWithFiltersAndPaginationPatients(query, user as User)
  }

  @Get('/image/:id')
  @ApiOkResponse({ description: 'Employee photo' })
  async getEmployeeImage(@Param() params: IdParams, @Res() res: Response) {
    const imageBuffer = await this.getService().getEmployeePhoto(params.id)
    if (imageBuffer) {
      // Detectar el tipo MIME basado en el contenido o usar jpg por defecto
      const mimeType = this.detectMimeType(imageBuffer) || 'image/jpeg'
      res.setHeader('Content-Type', mimeType)
      res.send(imageBuffer)
    } else {
      // Devolver imagen placeholder
      const placeholder = this.getPlaceholderImage()
      res.setHeader('Content-Type', 'image/svg+xml')
      res.send(placeholder)
    }
  }

  private detectMimeType(buffer: Buffer): string | null {
    // Detectar tipo MIME basado en los primeros bytes (magic numbers)
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg'
    }
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return 'image/png'
    }
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      return 'image/gif'
    }
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
      return 'image/webp'
    }
    return null
  }

  private getPlaceholderImage(): string {
    // SVG placeholder simple
    return `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
      <rect width="200" height="200" fill="#e0e0e0"/>
      <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="14" fill="#999" text-anchor="middle" dy=".3em">Sin imagen</text>
    </svg>`
  }

  @Get('/:id')
  @ApiOkResponse({ type: User, description: 'User detail' })
  @ApiNotFoundResponse({ description: 'User not found' })
  findOne(@Param() params: IdParams) {
    return this.getService().getByIdCustom(params.id)
  }

  @Post('/')
  @ApiBody({ type: UserDto, required: true })
  @ApiCreatedResponse({ type: User, description: 'User created' })
  async save(@Req() request: RequestWithUser, @Body() entity: UserDto) {
    const { user } = request
    const { company } = request
    console.log('🏥 User Endpoint - Company from interceptor:', company)
    console.log('🏥 User Endpoint - Full request object:', {
      headers: request.headers,
      body: entity,
      company: request.company,
      user: user,
    })
    return this.getService().createCustomUser(entity, company)
  }

  @Delete('/:id')
  @ApiNoContentResponse({ description: 'User deleted' })
  @ApiNotFoundResponse({ description: 'The user you want to delete does not exist' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Req() request: RequestWithUser, @Param() params: IdParams) {
    const { user } = request
    await this.getService().deleteOrFail(params.id)
  }

  @Put('/:id')
  @ApiNoContentResponse({ description: 'User updated' })
  @ApiNotFoundResponse({ description: 'The user you want to update does not exist' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(@Param() params: IdParams, @Body() entity: UpdateUserDto) {
    await this.getService().updateCustom(params.id, entity)
  }

  @Put('/:id/change-password')
  @ApiBody({ type: ChangePasswordDto, required: true })
  @ApiNoContentResponse({ description: 'Password changed successfully' })
  @ApiNotFoundResponse({ description: 'The user you want to change password does not exist' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(@Param() params: IdParams, @Body() changePasswordDto: ChangePasswordDto) {
    await this.getService().changePassword(params.id, changePasswordDto)
  }
}
