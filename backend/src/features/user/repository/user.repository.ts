import { HttpStatus, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { UserQueryDto } from '../dto/user.dto'
import { User } from '../entity/user.entity'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'
import { BaseRepository } from 'src/commons/repository/base.repository'
import { UserCompanyRel } from 'src/features/user.company.rel/entity/user.company.rel.entity'
import { I18nError } from 'src/commons/errors/i18n.error'
import { cleanUserData } from 'src/commons/utils/utils'
import { RoleEnum } from 'src/commons/enum/role.enum'

@Injectable()
export class UserRepository extends BaseRepository<User, UserQueryDto> {
  constructor(@InjectRepository(User) private readonly _: Repository<User>) {
    super(_.target, _.manager, _.queryRunner)
  }

  findByUsername(username: string) {
    return this.createQueryBuilder('user').andWhere('user.email = :username ', { username }).getOne()
  }

  async fetch(payload: UserQueryDto): Promise<PaginationDto<any>> {
    const { email, firstName, lastName, role, id, excludeUserId, dateSalary, page, pageSize, orderBy } = payload

    const query = this.createQueryBuilder('user').leftJoinAndSelect('user.userExtended', 'userExtended')

    if (email) query.andWhere('UPPER(user.email) LIKE UPPER(:email)', { email: `%${email}%` })
    if (firstName) query.andWhere('UPPER(user.firstName) LIKE UPPER(:firstName)', { firstName: `%${firstName}%` })
    if (lastName) query.andWhere('UPPER(user.lastName) LIKE UPPER(:lastName)', { lastName: `%${lastName}%` })
    if (role) query.andWhere('user.role = :role', { role })
    if (id) query.andWhere('user.id = :id', { id })

    if (excludeUserId) query.andWhere('user.id != :excludeUserId', { excludeUserId })

    // Determinar la fecha de referencia para los subselects
    // Si dateSalary está presente (formato yyyy-mm), primero buscar en ese mes/año
    // Si no encuentra, buscar la última información disponible sin restricción de fecha
    let dateCondition = `gd.date_from <= NOW()`
    let fallbackCondition = `gd.date_from <= NOW()`

    if (dateSalary) {
      // dateSalary viene en formato yyyy-mm (ej: "2025-11")
      // Extraer año y mes
      const [year, month] = dateSalary.split('-')
      if (year && month) {
        // Primero intentar buscar en el mes/año específico
        dateCondition = `YEAR(gd.date_from) = ${year} AND MONTH(gd.date_from) = ${month} AND gd.date_from <= LAST_DAY('${dateSalary}-01')`
        // Si no encuentra, buscar la última disponible sin restricción de mes/año
        fallbackCondition = `gd.date_from <= LAST_DAY('${dateSalary}-01')`
      }
    }

    // Usar COALESCE para intentar primero con la condición específica del mes, y si no encuentra, usar la fallback
    query.addSelect(
      `COALESCE(
        (SELECT gd.description FROM general_data gd WHERE gd.id_user = user.id AND gd.id_category = 6 AND ${dateCondition} ORDER BY gd.date_from DESC LIMIT 1),
        (SELECT gd.description FROM general_data gd WHERE gd.id_user = user.id AND gd.id_category = 6 AND ${fallbackCondition} ORDER BY gd.date_from DESC LIMIT 1)
      )`,
      'EMPLOYEE_PAYMENT_DRIVER',
    )
    query.addSelect(
      `COALESCE(
        (SELECT gd.description FROM general_data gd WHERE gd.id_user = user.id AND gd.id_category = 7 AND ${dateCondition} ORDER BY gd.date_from DESC LIMIT 1),
        (SELECT gd.description FROM general_data gd WHERE gd.id_user = user.id AND gd.id_category = 7 AND ${fallbackCondition} ORDER BY gd.date_from DESC LIMIT 1)
      )`,
      'EMPLOYEE_PAYMENT_AUX',
    )
    query.addSelect(
      `COALESCE(
        (SELECT gd.description FROM general_data gd WHERE gd.id_user = user.id AND gd.id_category = 9 AND ${dateCondition} ORDER BY gd.date_from DESC LIMIT 1),
        (SELECT gd.description FROM general_data gd WHERE gd.id_user = user.id AND gd.id_category = 9 AND ${fallbackCondition} ORDER BY gd.date_from DESC LIMIT 1)
      )`,
      'EMPLOYEE_PAYMENT_VIG_ROS',
    )
    query.addSelect(
      `COALESCE(
        (SELECT gd.description FROM general_data gd WHERE gd.id_user = user.id AND gd.id_category = 10 AND ${dateCondition} ORDER BY gd.date_from DESC LIMIT 1),
        (SELECT gd.description FROM general_data gd WHERE gd.id_user = user.id AND gd.id_category = 10 AND ${fallbackCondition} ORDER BY gd.date_from DESC LIMIT 1)
      )`,
      'EMPLOYEE_PAYMENT_VIG_BSAS',
    )
    query.addSelect(
      `COALESCE(
        (SELECT gd.description FROM general_data gd WHERE gd.id_user = user.id AND gd.id_category = 11 AND ${dateCondition} ORDER BY gd.date_from DESC LIMIT 1),
        (SELECT gd.description FROM general_data gd WHERE gd.id_user = user.id AND gd.id_category = 11 AND ${fallbackCondition} ORDER BY gd.date_from DESC LIMIT 1)
      )`,
      'EMPLOYEE_PAYMENT_OFFICE',
    )

    this.getOrderBy(query, payload)

    const shouldPaginate = page !== undefined && pageSize !== undefined && pageSize > 0

    if (
      (page !== undefined && (pageSize === undefined || pageSize <= 0)) ||
      (pageSize !== undefined && (page === undefined || page < 0))
    ) {
      throw new I18nError('common.error.pagination.data.error', HttpStatus.BAD_REQUEST)
    }

    if (!shouldPaginate) {
      const [data, rawData] = await Promise.all([query.getMany(), query.getRawMany()])

      // Convertir rawData a camelCase usando el método de la clase base
      const transformedRawData = this.transformedRaw(rawData)

      // Crear un mapa para buscar por ID (usar userId que viene del raw data)
      const rawDataMap = new Map(transformedRawData.map(item => [item.userId, item]))

      // Combinar los datos de getMany con los select adicionales de getRawMany
      const enrichedData = data.map(user => {
        const rawUser = rawDataMap.get(user.id)
        console.log(`User ${user.id} raw data (no pagination):`, rawUser)
        return {
          ...cleanUserData(user),
          employeePaymentDriver: rawUser?.EMPLOYEE_PAYMENT_DRIVER,
          employeePaymentAux: rawUser?.EMPLOYEE_PAYMENT_AUX,
          employeePaymentVigRos: rawUser?.EMPLOYEE_PAYMENT_VIG_ROS,
          employeePaymentVigBsas: rawUser?.EMPLOYEE_PAYMENT_VIG_BSAS,
          employeePaymentOffice: rawUser?.EMPLOYEE_PAYMENT_OFFICE,
        }
      })

      return new PaginationDto({
        data: enrichedData,
        total: enrichedData.length,
        page: 0,
        pageSize: enrichedData.length,
        lastPage: 0,
      })
    }

    const pageNumber = page
    const take = pageSize
    const skip = Math.max(0, pageNumber) * take

    const [data, rawData, total] = await Promise.all([
      query.take(take).skip(skip).getMany(),
      query.take(take).skip(skip).getRawMany(),
      query.getCount(),
    ])
    // Convertir rawData a camelCase usando el método de la clase base
    const transformedRawData = this.transformedRaw(rawData)

    // Crear un mapa para buscar por ID (usar userId que viene del raw data)
    const rawDataMap = new Map(transformedRawData.map(item => [item.userId, item]))

    // Combinar los datos de getMany con los select adicionales de getRawMany
    const enrichedData = data.map(user => {
      const rawUser = rawDataMap.get(user.id)

      return {
        ...cleanUserData(user),
        employeePaymentDriver: rawUser?.EMPLOYEE_PAYMENT_DRIVER,
        employeePaymentAux: rawUser?.EMPLOYEE_PAYMENT_AUX,
        employeePaymentVigRos: rawUser?.EMPLOYEE_PAYMENT_VIG_ROS,
        employeePaymentVigBsas: rawUser?.EMPLOYEE_PAYMENT_VIG_BSAS,
        employeePaymentOffice: rawUser?.EMPLOYEE_PAYMENT_OFFICE,
      }
    })
    return new PaginationDto({
      data: enrichedData,
      total,
      page: pageNumber,
      pageSize: take,
      lastPage: total ? Math.ceil(total / take) : 0,
    })
  }

  async getById(id: number) {
    return await this.createQueryBuilder('user')
      .leftJoinAndSelect('user.userExtended', 'userExtended')
      .leftJoinAndSelect('user.userCompanyRels', 'userCompanyRels')
      .leftJoinAndSelect('userCompanyRels.company', 'company')
      .withDeleted()
      .leftJoinAndSelect('userCompanyRels.role', 'role')
      .withDeleted()
      .where('user.id = :id', { id })
      .getOne()
  }

  async findByUsernameWithDeleteAt(username: string) {
    return this.createQueryBuilder('user').withDeleted().andWhere('user.email = :username ', { username }).getOne()
  }

  async getUserCompanies(userId: number) {
    return this.createQueryBuilder('user')
      .leftJoin('user_company_rel', 'rel', 'rel.id_user = user.id')
      .leftJoin('company', 'company', 'company.id = rel.id_company')
      .leftJoin('company', 'parent', 'parent.id = company.id_parent')
      .leftJoin('role', 'role', 'role.id = rel.id_role')
      .select([
        'company.id as companyId',
        'company.companyName as companyName',
        'role.roleName as roleName',
        'rel.is_default as isDefault',
        'company.id_parent as idParent',
        'parent.id as parentId',
        'parent.companyName as parentCompanyName',
      ])
      .where('user.id = :userId', { userId })
      .getRawMany()
  }

}
