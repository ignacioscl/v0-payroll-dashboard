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
import { UserCompanyRelService } from '../service/user.company.rel.service'
import {
  UserCompanyRelDto,
  UserCompanyRelPaginationDto,
  UserCompanyRelQueryDto,
  UpdateUserCompanyRelDto,
  DeleteUserCompanyRelDto,
} from '../dto/user.company.rel.dto'
import { UserCompanyRel } from '../entity/user.company.rel.entity'
import { RequestWithUser } from '../../../features/auth/types/request.user.type'
import { DataErrorDto } from 'src/commons/errors/data.error.dto'

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.ADMIN)
@Controller('/api/user-company-rel')
@ApiTags('UserCompanyRel')
@ApiBearerAuth()
export class UserCompanyRelController {
  constructor(@Inject(UserCompanyRelService) private readonly service: UserCompanyRelService) {}

  getService(): UserCompanyRelService {
    return this.service
  }

  @Get('/')
  @ApiOkResponse({ type: UserCompanyRelPaginationDto })
  async findAll(@Req() request: RequestWithUser, @Query() query: UserCompanyRelQueryDto) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { user } = request
    // If necessary, have the session UserCompanyRel
    return await this.getService().fetch(query)
  }
}
