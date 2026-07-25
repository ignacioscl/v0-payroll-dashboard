import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { BaseRepository } from 'src/commons/repository/base.repository'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'
import { RolAccionRelTemplateQueryDto } from '../dto/rol-template.dto'
import { RolAccionRelTemplate } from '../entity/rol-accion-rel-template.entity'

@Injectable()
export class RolAccionRelTemplateRepository extends BaseRepository<
  RolAccionRelTemplate,
  RolAccionRelTemplateQueryDto
> {
  constructor(
    @InjectRepository(RolAccionRelTemplate)
    private readonly _: Repository<RolAccionRelTemplate>,
  ) {
    super(_.target, _.manager, _.queryRunner)
  }

  public async fetch(
    payload: RolAccionRelTemplateQueryDto,
  ): Promise<PaginationDto<RolAccionRelTemplate>> {
    const query = this.createQueryBuilder('r')
    if (payload.id != null) {
      query.andWhere('r.id = :id', { id: payload.id })
    }
    if (payload.idRolTemplate != null) {
      query.andWhere('r.idRolTemplate = :idRolTemplate', {
        idRolTemplate: payload.idRolTemplate,
      })
    }
    return this.applyPagination(query, payload)
  }

  async listAccionIds(idRolTemplate: number): Promise<number[]> {
    const rows = await this.find({ where: { idRolTemplate } })
    return rows.map((r) => r.idRolAccion)
  }

  /** Hard delete + insert — unique (template, accion) conflicts with soft-deleted rows. */
  async replaceForTemplate(idRolTemplate: number, idsRolAccion: number[]): Promise<void> {
    // Must be a hard DELETE: soft-delete leaves rows that block uk_rart_template_accion.
    await this.createQueryBuilder()
      .delete()
      .from(RolAccionRelTemplate)
      .where('id_rol_template = :idRolTemplate', { idRolTemplate })
      .execute()
    if (!idsRolAccion.length) return
    await this.save(
      idsRolAccion.map((idRolAccion) => this.create({ idRolTemplate, idRolAccion })),
    )
  }
}
