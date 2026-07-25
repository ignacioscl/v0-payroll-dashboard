import { Inject, Injectable } from '@nestjs/common'
import { In } from 'typeorm'

import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { RolAccionRelService } from 'src/features/srs-rol/service/rol-accion-rel.service'
import { UsuarioSrsQueryDto } from '../dto/usuario-srs.dto'
import { UsuarioSrs } from '../entity/usuario-srs.entity'
import { UsuarioSrsRepository } from '../repository/usuario-srs.repository'

@Injectable()
export class UsuarioSrsService extends GlobalBaseService<UsuarioSrs, UsuarioSrsQueryDto> {
  constructor(
    @Inject(UsuarioSrsRepository) private readonly repository: UsuarioSrsRepository,
    @Inject(RolAccionRelService) private readonly rolePerms: RolAccionRelService,
  ) {
    super()
  }

  protected getRepository(): UsuarioSrsRepository {
    return this.repository
  }

  async userHasRolAccion(idUsuario: number, idAccion: number): Promise<boolean> {
    const user = await this.repository.findOne({ where: { idUsuario } })
    if (!user) return false
    if (user.idRol === 1 || user.idRol === 2) return true
    if (!user.idRolSystemV2 || user.idRolSystemV2 < 1) return false
    const count = await this.rolePerms.countForRoleAndAccion(user.idRolSystemV2, idAccion)
    return count > 0
  }

  async mapNombresByIds(ids: number[]): Promise<Map<number, string>> {
    const map = new Map<number, string>()
    const uniq = Array.from(new Set(ids.map(Number).filter((n) => n > 0)))
    if (!uniq.length) return map
    const rows = await this.repository.find({ where: { idUsuario: In(uniq) } })
    for (const u of rows) {
      map.set(u.idUsuario, (u.nombre ?? '').trim() || `#${u.idUsuario}`)
    }
    return map
  }
}
