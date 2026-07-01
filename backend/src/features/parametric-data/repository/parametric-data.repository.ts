import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { ParametricData } from '../entity/parametric-data.entity'
import { BaseRepository } from 'src/commons/repository/base.repository'
import { ParametricDataQueryDto } from '../dto/parametric-data.dto'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'
import { ParametricDataCategories } from 'src/commons/enum/parametric-data-categories'

@Injectable()
export class ParametricDataRepository extends BaseRepository<ParametricData, ParametricDataQueryDto> {
  constructor(@InjectRepository(ParametricData) private readonly _: Repository<ParametricData>) {
    super(_.target, _.manager, _.queryRunner)
  }
  public async fetch(payload: ParametricDataQueryDto): Promise<PaginationDto<ParametricData>> {
    const { id, idParametricCategory, idParent, orderBy } = payload
    const query = this.createQueryBuilder('p')
      .innerJoinAndSelect('p.parametricDataCategory', 'parametricDataCategory')
      .leftJoinAndSelect('p.parent', 'parent')

    if (payload.includePermissionActions) {
      query.leftJoinAndSelect('p.permissionActions', 'permissionActions')
    }
    if (id) {
      query.andWhere('p.id = :id', { id })
    }
    if (idParametricCategory) {
      query.andWhere('p.idParametricCategory = :idParametricCategory', { idParametricCategory })
    }
    if (idParent) {
      query.andWhere('p.idParent = :idParent', { idParent })
    }
    if (orderBy) {
      this.getOrderBy(query, payload)
    } else {
      query.orderBy('p.orderBy', 'ASC')
    }
    return await this.applyPagination(query, payload)
  }

  public async fetchPermissionRaw(payload: ParametricDataQueryDto): Promise<PaginationDto<any>> {
    const { orderBy, idRole } = payload

    const query = this.createQueryBuilder('p')
      .select([
        'p.id as id',
        'p.idParametricCategory as idParametricCategory',
        'p.idParent as idParent',
        'p.internalCode as internalCode',
        'p.name as name',
        'p.description as description',
        'p.jsonInfo as jsonInfo',
        'p.additionalData as additionalData',
        'p.orderBy as orderBy',
        'p.createdAt as createdAt',
        'p.updatedAt as updatedAt',
      ])
      .addSelect(
        `(
          SELECT CONCAT(
            '[', 
            GROUP_CONCAT(
              CONCAT(
                '{',
                  '"id":', pa.id, ',',
                  '"code_page":"', pa.code_page, '",',
                  '"description_sp":"', pa.description_sp, '",',
                  '"description_en":"', pa.description_en, '",',
                  '"permission_include":', IFNULL(JSON_QUOTE(pa.permission_include), '""'), ',',
                  '"id_role":', IFNULL(rpa.id_role, 'null'), ',',
                  '"order_by":', pa.order_by,
                '}'
              )
              ORDER BY pa.order_by ASC
              SEPARATOR ','
            ),
            ']'
          )
          FROM permission_action pa 
          LEFT JOIN role_permission_action rpa ON rpa.id_permission_action=pa.id AND rpa.id_role = ${idRole}
          WHERE pa.code_page = p.internal_code
        )`,
        'permissionActions',
      )

    query.andWhere('p.idParametricCategory = :idParametricCategory', {
      idParametricCategory: ParametricDataCategories.MENU.id,
    })

    if (orderBy) {
      this.getOrderBy(query, payload)
    } else {
      query.orderBy('p.orderBy', 'ASC')
    }

    const result = await this.applyPaginationRaw(query, payload)

    // Parse the JSON string for permission_actions
    const data = result.data.map((row: any) => ({
      ...row,
      permissionActions: row.permissionActions ? JSON.parse(row.permissionActions) : [],
    }))

    return {
      ...result,
      data,
    }
  }
}
