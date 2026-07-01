import { HttpStatus, Inject, Injectable } from '@nestjs/common'

import { Role } from '../entity/role.entity'
import { RoleRepository } from '../repository/role.repository'
import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { RoleDto, RoleQueryDto, UpdateRoleDto } from '../dto/role.dto'
import { BaseRepository } from 'src/commons/repository/base.repository'
import { I18nError } from 'src/commons/errors/i18n.error'

@Injectable()
export class RoleService extends GlobalBaseService<Role, RoleQueryDto> {
  constructor(@Inject(RoleRepository) private readonly repository: RoleRepository) {
    super()
  }

  protected getRepository(): RoleRepository {
    return this.repository
  }

  async customCreate(entity: Role): Promise<Role> {
    const result = await this.fetch({ idCompany: entity.idCompany, roleName: entity.roleName })
    if (result.data.length > 0) {
      throw new I18nError('role.duplicate-name', HttpStatus.PRECONDITION_FAILED, [entity.roleName])
    }
    const role = await this.create(entity)

    return await this.getById(role.id!)
  }

  async customUpdate(id: number, entity: UpdateRoleDto): Promise<void> {
    const role = await this.updateById(id, entity)
  }
}
