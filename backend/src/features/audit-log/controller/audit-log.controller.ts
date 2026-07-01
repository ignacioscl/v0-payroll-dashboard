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
import { AuditLogService } from '../service/audit-log.service'
import { AuditService } from '../service/audit.service'
import { AuditLogQueryDto, AuditLogPaginationDto } from '../dto/audit-log.dto'
import { AuditLog } from '../entity/audit-log.entity'
import { RequestWithUser } from '../../../features/auth/types/request.user.type'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.ADMIN)
@Controller('/audit-log')
@ApiTags('AuditLog')
@ApiBearerAuth()
export class AuditLogController {
  constructor(
    @Inject(AuditLogService) private readonly service: AuditLogService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  getService(): AuditLogService {
    return this.service
  }

  @Get('/')
  @ApiOkResponse({ type: AuditLogPaginationDto })
  async getLogsByRecord(@Query() query: AuditLogQueryDto): Promise<PaginationDto<AuditLog>> {
    return await this.service.fetch(query)
  }

  @Get('/log-data')
  @ApiOkResponse({ type: [AuditLog] })
  async getLogsWithRelations(@Query() query: AuditLogQueryDto): Promise<AuditLog[]> {
    return await this.auditService.getLogsWithRelations(query)
  }
}
