import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'

import { BaseRepository } from 'src/commons/repository/base.repository'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'
import { Rol } from '../entity/rol.entity'
import { RolAccionRelQueryDto } from '../dto/srs-rol.dto'
import { RolAccionRel } from '../entity/rol-accion-rel.entity'

@Injectable()
export class RolAccionRelRepository extends BaseRepository<RolAccionRel, RolAccionRelQueryDto> {
  constructor(
    @InjectRepository(RolAccionRel)
    private readonly _: Repository<RolAccionRel>,
  ) {
    super(_.target, _.manager, _.queryRunner)
  }

  public async fetch(payload: RolAccionRelQueryDto): Promise<PaginationDto<RolAccionRel>> {
    const query = this.createQueryBuilder('r')
    if (payload.id != null) {
      query.andWhere('r.id = :id', { id: payload.id })
    }
    if (payload.idRol != null) {
      query.andWhere('r.idRol = :idRol', { idRol: payload.idRol })
    }
    return this.applyPagination(query, payload)
  }

  async replaceForRole(idRol: number, idsRolAccion: number[]): Promise<void> {
    await this.delete({ idRol })
    if (!idsRolAccion.length) return
    await this.save(idsRolAccion.map((idRolAccion) => this.create({ idRol, idRolAccion })))
  }

  async countByRoleIds(ids: number[]): Promise<Map<number, number>> {
    const map = new Map<number, number>()
    if (!ids.length) return map
    const rows = await this.createQueryBuilder('r')
      .select('r.idRol', 'idRol')
      .addSelect('COUNT(*)', 'cant')
      .where('r.idRol IN (:...ids)', { ids })
      .groupBy('r.idRol')
      .getRawMany<{ idRol: number; cant: string }>()
    for (const row of rows) {
      map.set(Number(row.idRol), Number(row.cant))
    }
    return map
  }

  async countForRoleAndAccion(idRol: number, idRolAccion: number) {
    return this.count({ where: { idRol, idRolAccion } })
  }

  async listAccionIds(idRol: number): Promise<number[]> {
    const rows = await this.find({ where: { idRol }, select: ['idRolAccion'] })
    return rows.map((row) => Number(row.idRolAccion)).filter((id) => id > 0)
  }

  /**
   * Replace permissions for every ROL with id_template = idTemplate.
   * Returns the child role ids that were updated.
   */
  async replaceForTemplateChildren(
    idTemplate: number,
    idsRolAccion: number[],
  ): Promise<number[]> {
    const childRows = await this.manager
      .getRepository(Rol)
      .find({ where: { idTemplate }, select: ['idRol'] })
    const idRols = childRows.map((r) => Number(r.idRol)).filter((n) => n > 0)
    if (!idRols.length) return []

    await this.delete({ idRol: In(idRols) })

    if (!idsRolAccion.length) return idRols

    const rows: RolAccionRel[] = []
    for (const idRol of idRols) {
      for (const idRolAccion of idsRolAccion) {
        rows.push(this.create({ idRol, idRolAccion }))
      }
    }
    await this.save(rows)
    return idRols
  }
}
