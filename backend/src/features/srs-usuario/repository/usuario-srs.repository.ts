import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, Repository } from 'typeorm'

import { BaseRepository } from 'src/commons/repository/base.repository'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'
import { UsuarioSrsQueryDto } from '../dto/usuario-srs.dto'
import { UsuarioSrs } from '../entity/usuario-srs.entity'

@Injectable()
export class UsuarioSrsRepository extends BaseRepository<UsuarioSrs, UsuarioSrsQueryDto> {
  constructor(
    @InjectRepository(UsuarioSrs)
    private readonly _: Repository<UsuarioSrs>,
  ) {
    super(_.target, _.manager, _.queryRunner)
  }

  public async fetch(payload: UsuarioSrsQueryDto): Promise<PaginationDto<UsuarioSrs>> {
    const query = this.createQueryBuilder('u')
    if (payload.id != null) {
      query.andWhere('u.idUsuario = :id', { id: payload.id })
    }
    return this.applyPagination(query, payload)
  }

  /**
   * Usuarios activos que tienen el rol en USUARIO_ROL_REL, usuarios.id_rol o usuarios.id_rol_system_v2.
   * Es lo que bloquea eliminar un rol; mismo SQL que RolDao::countActiveUsersAssigned del PHP.
   */
  countActiveAssignedToRole(idRol: number): Promise<number> {
    return this.createQueryBuilder('u')
      .where('u.estado = 1')
      .andWhere('u.isInactive = 0')
      .andWhere(
        new Brackets((qb) => {
          qb.where('u.idRol = :idRol')
            .orWhere('u.idRolSystemV2 = :idRol')
            .orWhere(
              'EXISTS (SELECT 1 FROM USUARIO_ROL_REL urr WHERE urr.id_usuario = u.id_usuario AND urr.id_rol = :idRol)',
            )
        }),
      )
      .setParameters({ idRol })
      .getCount()
  }
}
