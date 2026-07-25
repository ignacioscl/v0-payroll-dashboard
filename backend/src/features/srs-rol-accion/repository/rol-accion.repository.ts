import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository, SelectQueryBuilder } from 'typeorm'

import { BaseRepository } from 'src/commons/repository/base.repository'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'
import { RolAccionQueryDto } from '../dto/rol-accion.dto'
import { RolAccion } from '../entity/rol-accion.entity'

@Injectable()
export class RolAccionRepository extends BaseRepository<RolAccion, RolAccionQueryDto> {
  constructor(
    @InjectRepository(RolAccion)
    private readonly _: Repository<RolAccion>,
  ) {
    super(_.target, _.manager, _.queryRunner)
  }

  public async fetch(payload: RolAccionQueryDto): Promise<PaginationDto<RolAccion>> {
    const query = this.createQueryBuilder('ra')
    if (payload.id != null) {
      query.andWhere('ra.id = :id', { id: payload.id })
    }
    if (payload.tipo != null) {
      query.andWhere('(ra.tipo IS NULL OR ra.tipo = 0 OR ra.tipo = :tipo)', { tipo: payload.tipo })
    }
    query.orderBy('ra.posicion', 'ASC').addOrderBy('ra.id', 'ASC')
    return this.applyPagination(query, payload)
  }

  /**
   * Mirrors the legacy `RolAccionFilter`/`RolDao::loadRolAccion` visibility rules (tipo,
   * per-company enabled apps, ROL_ACCION_COMPANY overrides) so templates show the exact same
   * candidate permissions a role for the same company/tipo would show.
   */
  private applyRoleContext(
    query: SelectQueryBuilder<RolAccion>,
    context: RolAccionRoleContext,
  ) {
    const { tipo, idCompanyFilter, appValet, moduloTV } = context

    if (tipo > 0) {
      query.andWhere('(ra.tipo = :tipo OR ra.tipo IS NULL)', { tipo })
    }

    // Legacy quirk (RolDao::loadRolAccion): when both apps are enabled the app filter has no
    // effect (an OR-precedence bug makes the EXISTS clause always true). Kept for parity.
    if (appValet && moduloTV) {
      // no-op, intentionally
    } else if (appValet || moduloTV) {
      query.andWhere('(ra.isAppMain = 1 OR (ra.isAppValet = :appValet AND ra.isAppTv = :moduloTV))', {
        appValet: appValet ? 1 : 0,
        moduloTV: moduloTV ? 1 : 0,
      })
    } else {
      query.andWhere('ra.isAppMain = 1')
    }

    if (idCompanyFilter > 0) {
      query.andWhere(
        `(
          (ra.isAllCompanies = 1 OR (ra.isAllCompanies = 0 AND EXISTS (
            SELECT 1 FROM ROL_ACCION_COMPANY rac
            WHERE rac.id_rol_accion = ra.id AND rac.id_rol_company = :idCompanyFilter AND rac.type_include = 1
          )))
          OR NOT (ra.isAllCompanies = 0 AND NOT EXISTS (
            SELECT 1 FROM ROL_ACCION_COMPANY rac
            WHERE rac.id_rol_accion = ra.id AND rac.id_rol_company = :idCompanyFilter AND rac.type_include = 0
          ))
        )`,
        { idCompanyFilter },
      )
      query.andWhere(
        `ra.id NOT IN (
          SELECT rac.id_rol_accion FROM ROL_ACCION_COMPANY rac
          WHERE rac.id_rol_company = :idCompanyFilter AND rac.type_include = 3
        )`,
        { idCompanyFilter },
      )
    }

    return query
  }

  async listForRoleContext(context: RolAccionRoleContext): Promise<RolAccion[]> {
    const query = this.applyRoleContext(this.createQueryBuilder('ra'), context)
    return query.orderBy('ra.posicion', 'ASC').addOrderBy('ra.id', 'ASC').getMany()
  }

  async findValidIdsForRoleContext(ids: number[], context: RolAccionRoleContext): Promise<number[]> {
    if (!ids.length) return []
    const query = this.applyRoleContext(this.createQueryBuilder('ra'), context)
    const rows = await query.andWhere('ra.id IN (:...ids)', { ids }).getMany()
    return rows.map((r) => Number(r.id))
  }

  async findActionsByIds(ids: number[]): Promise<RolAccion[]> {
    if (!ids.length) return []
    return this.find({ where: { id: In(ids) } })
  }

  async findNombresByIds(ids: number[]): Promise<Map<number, string>> {
    if (!ids.length) return new Map()
    const rows = await this.find({
      where: { id: In(ids) },
      select: ['id', 'nombreAccion'],
    })
    return new Map(rows.map((row) => [row.id, row.nombreAccion]))
  }
}

export interface RolAccionRoleContext {
  /** ROL.tipo of the role/template (1=internal, 2=external). */
  tipo: number
  /** CONTRATISTA id used for ROL_ACCION_COMPANY overrides (usr->getCompany()->getId() in legacy). */
  idCompanyFilter: number
  /** CONTRATISTA.is_dealer_app_valet for idCompanyFilter. */
  appValet: boolean
  /** CONTRATISTA.has_module_tv for idCompanyFilter. */
  moduloTV: boolean
}
