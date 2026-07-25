import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'

import { BaseRepository } from 'src/commons/repository/base.repository'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'
import { SrsRolQueryDto } from '../dto/srs-rol.dto'
import { Rol } from '../entity/rol.entity'

@Injectable()
export class RolRepository extends BaseRepository<Rol, SrsRolQueryDto> {
  constructor(
    @InjectRepository(Rol)
    private readonly _: Repository<Rol>,
  ) {
    super(_.target, _.manager, _.queryRunner)
  }

  public async fetch(payload: SrsRolQueryDto): Promise<PaginationDto<Rol>> {
    const query = this.createQueryBuilder('r').leftJoinAndSelect('r.dealer', 'dealer')
    if (payload.id != null) {
      query.andWhere('r.idRol = :id', { id: payload.id })
    }
    if (payload.idTemplate != null) {
      query.andWhere('r.idTemplate = :idTemplate', { idTemplate: payload.idTemplate })
    }
    if (payload.idCompaniaOwner != null) {
      query.andWhere('r.idCompaniaOwner = :owner', { owner: payload.idCompaniaOwner })
    }
    if (payload.idDealer != null) {
      query.andWhere('r.idDealer = :idDealer', { idDealer: payload.idDealer })
    }
    if (payload.tipo != null) {
      query.andWhere('r.tipo = :tipo', { tipo: payload.tipo })
    }
    query.orderBy('r.nombre', 'ASC')
    return this.applyPagination(query, payload)
  }

  countByTemplate(idTemplate: number) {
    return this.count({ where: { idTemplate } })
  }

  findChildren(idTemplate: number) {
    return this.find({
      where: { idTemplate },
      relations: ['dealer'],
      order: { nombre: 'ASC' },
    })
  }

  findOwnedChild(idTemplate: number, idRol: number, idCompaniaOwner: number) {
    return this.findOne({ where: { idRol, idTemplate, idCompaniaOwner } })
  }

  hasInternalChild(idTemplate: number) {
    return this.exist({ where: { idTemplate, tipo: 1 } })
  }

  async findExistingDealerIds(idTemplate: number, idDealers: number[]): Promise<number[]> {
    if (!idDealers.length) return []
    const rows = await this.find({
      where: { idTemplate, idDealer: In(idDealers) },
      select: ['idDealer'],
    })
    return rows.map((r) => Number(r.idDealer)).filter((n) => n > 0)
  }

  async findNombresByIds(ids: number[]): Promise<Map<number, string>> {
    if (!ids.length) return new Map()
    const rows = await this.find({
      where: { idRol: In(ids) },
      select: ['idRol', 'nombre'],
    })
    return new Map(rows.map((row) => [row.idRol, row.nombre]))
  }

  async countUsersAssigned(idRol: number): Promise<number> {
    const rows = await this.createQueryBuilder()
      .select('COUNT(*)', 'c')
      .from('USUARIO_ROL_REL', 'urr')
      .where('urr.id_rol = :idRol', { idRol })
      .getRawOne<{ c: string }>()
    return Number(rows?.c ?? 0)
  }
}
