import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { UserCompanyRel } from '../entity/user.company.rel.entity'
import { BaseRepository } from 'src/commons/repository/base.repository'
import { UserCompanyRelPaginationDto, UserCompanyRelQueryDto } from '../dto/user.company.rel.dto'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'

@Injectable()
export class UserCompanyRelRepository extends BaseRepository<UserCompanyRel, UserCompanyRelQueryDto> {
  constructor(@InjectRepository(UserCompanyRel) private readonly _: Repository<UserCompanyRel>) {
    super(_.target, _.manager, _.queryRunner)
  }

  public async fetch(payload: UserCompanyRelQueryDto): Promise<PaginationDto<UserCompanyRel>> {
    const { id, idUser, idCompany, idRole } = payload

    const query = this.createQueryBuilder('userCompanyRel')
      .leftJoinAndSelect('userCompanyRel.user', 'user')
      .leftJoinAndSelect('userCompanyRel.company', 'company')
      .leftJoinAndSelect('userCompanyRel.role', 'role')

    if (id) query.andWhere('userCompanyRel.id = :id', { id })
    if (idUser) query.andWhere('userCompanyRel.idUser = :idUser', { idUser })
    if (idCompany) query.andWhere('userCompanyRel.idCompany = :idCompany', { idCompany })
    if (idRole) query.andWhere('userCompanyRel.idRole = :idRole', { idRole })

    return await this.applyPagination(query, payload)
  }

  async deleteByUserId(idUser: number): Promise<void> {
    await this.createQueryBuilder().delete().from(UserCompanyRel).where('id_user = :idUser', { idUser }).execute()
  }
}
