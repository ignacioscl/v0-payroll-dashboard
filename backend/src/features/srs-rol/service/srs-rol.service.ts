import { Inject, Injectable } from '@nestjs/common'

import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { SrsRolQueryDto } from '../dto/srs-rol.dto'
import { Rol } from '../entity/rol.entity'
import { RolRepository } from '../repository/rol.repository'

@Injectable()
export class SrsRolService extends GlobalBaseService<Rol, SrsRolQueryDto> {
  constructor(@Inject(RolRepository) private readonly repository: RolRepository) {
    super()
  }

  protected getRepository(): RolRepository {
    return this.repository
  }

  countByTemplate(idTemplate: number) {
    return this.repository.countByTemplate(idTemplate)
  }

  findChildren(idTemplate: number) {
    return this.repository.findChildren(idTemplate)
  }

  findOwnedChild(idTemplate: number, idRol: number, idCompaniaOwner: number) {
    return this.repository.findOwnedChild(idTemplate, idRol, idCompaniaOwner)
  }

  hasInternalChild(idTemplate: number) {
    return this.repository.hasInternalChild(idTemplate)
  }

  findExistingDealerIds(idTemplate: number, idDealers: number[]) {
    return this.repository.findExistingDealerIds(idTemplate, idDealers)
  }

  findNombresByIds(ids: number[]) {
    return this.repository.findNombresByIds(ids)
  }

  countUsersAssigned(idRol: number) {
    return this.repository.countUsersAssigned(idRol)
  }

  /** TypeORM maps `idRol` → `id_rol`; do not use updateByIdCustom('idRol') (raw WHERE). */
  updateEstado(idRol: number, estado: number) {
    return this.repository.update({ idRol }, { estado })
  }

  deleteByIdRol(idRol: number) {
    return this.repository.delete({ idRol })
  }
}
