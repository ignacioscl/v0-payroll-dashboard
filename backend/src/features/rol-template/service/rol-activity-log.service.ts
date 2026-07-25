import { BadRequestException, Inject, Injectable } from '@nestjs/common'

import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { RolActivityLogQueryDto } from '../dto/rol-template.dto'
import { RolActivityLog, RolActivityLogAction } from '../entity/rol-activity-log.entity'
import { RolActivityLogRepository } from '../repository/rol-activity-log.repository'

export { RolActivityLogAction }

type AppendInput = {
  idAuthor: number
  action: RolActivityLogAction
  summary: string
  detail?: Record<string, unknown> | null
}

@Injectable()
export class RolActivityLogService extends GlobalBaseService<RolActivityLog, RolActivityLogQueryDto> {
  constructor(@Inject(RolActivityLogRepository) private readonly repository: RolActivityLogRepository) {
    super()
  }

  protected getRepository(): RolActivityLogRepository {
    return this.repository
  }

  listForTemplate(idRolTemplate: number, take = 100) {
    return this.repository.listForTemplate(idRolTemplate, take)
  }

  listForRole(idRol: number, take = 100) {
    return this.repository.listForRole(idRol, take)
  }

  appendForTemplate(input: AppendInput & { idRolTemplate: number }) {
    return this.append({
      idRolTemplate: input.idRolTemplate,
      idRol: null,
      idAuthor: input.idAuthor,
      action: input.action,
      summary: input.summary,
      detail: input.detail,
    })
  }

  appendForRole(input: AppendInput & { idRol: number }) {
    return this.append({
      idRolTemplate: null,
      idRol: input.idRol,
      idAuthor: input.idAuthor,
      action: input.action,
      summary: input.summary,
      detail: input.detail,
    })
  }

  private async append(input: {
    idRolTemplate: number | null
    idRol: number | null
    idAuthor: number
    action: RolActivityLogAction
    summary: string
    detail?: Record<string, unknown> | null
  }) {
    const hasTemplate = input.idRolTemplate != null && input.idRolTemplate > 0
    const hasRole = input.idRol != null && input.idRol > 0
    if (hasTemplate === hasRole) {
      throw new BadRequestException('Exactly one of idRolTemplate or idRol is required')
    }
    return this.create({
      idRolTemplate: hasTemplate ? input.idRolTemplate : null,
      idRol: hasRole ? input.idRol : null,
      idAuthor: input.idAuthor,
      action: input.action,
      summary: input.summary.slice(0, 512),
      detailJson: input.detail ?? null,
    })
  }
}
