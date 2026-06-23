import { HttpStatus, NotFoundException } from '@nestjs/common'
import { DeepPartial, FindManyOptions, FindOneOptions, Repository, SaveOptions } from 'typeorm'

import { EntityBase } from '../entity/entity-base'

import { getColumnNameFromEx } from '../utils/utils'
import { I18nError } from '../errors/i18n.error'
import { PaginationDto, RequestPaginationDto } from '../pagination/Pagination.dto'

export abstract class BaseService<T extends EntityBase> {
  protected abstract getRepository(): Repository<T>

  public async findAll(t?: FindManyOptions<T>) {
    return this.getRepository().find(t)
  }

  public async findAllPaginated(payload?: RequestPaginationDto, t: FindManyOptions<T> = {}): Promise<PaginationDto<T>> {
    const page = payload?.page ? payload.page : 0
    const pageSize = payload?.pageSize
    const take = pageSize ?? 10
    const skip = Math.max(0, page - 1) * take
    const [data, total]: [T[], number] = await this.getRepository().findAndCount({ ...t, skip, take })
    return new PaginationDto({
      data,
      page,
      pageSize: take,
      lastPage: Math.ceil(total / take),
      total,
    })
  }

  public async findById(id: number, identifier: string = 'id') {
    return await this.getRepository().createQueryBuilder().where(`${identifier} = :id`, { id }).getOne()
  }

  public async findByIdOrFail(id: number, identifier: string = 'domnro'): Promise<T> {
    const object = await this.getRepository().createQueryBuilder().where(`${identifier} = :id`, { id }).getOne()
    if (!object) throw new NotFoundException(`Object with id ${id} not found`)
    return object
  }

  public async findByIds(ids: number[]) {
    /*return this.getRepository().findBy({
      id: In(ids),
    } as FindOptionsWhere<T>)*/
  }

  public async findOneByFilter(t: FindOneOptions<T>) {
    return this.getRepository().findOne(t)
  }

  public async delete(id: number) {
    return this.getRepository().softDelete(id)
  }

  public async deleteOrFail(id: number) {
    await this.findByIdOrFail(id)
    return this.getRepository().softDelete(id)
  }

  public async deleteHard(id: number) {
    return this.getRepository().delete(id)
  }

  public async create(
    payload: DeepPartial<T>,
    data?: SaveOptions & {
      reload: false
    },
  ) {
    try {
      const entity = await this.getRepository().create(payload)
      return await this.getRepository().save(entity, data)
    } catch (error: any) {
      if (error.originalError.toString().includes('duplicate key')) {
        //status: number, message: string, type = 'DataError', httpStatus?: HttpStatus, description?: string
        throw new I18nError('error.dao.duplicatedKey', HttpStatus.BAD_REQUEST)
        /*throw new DataError(
          HttpStatus.BAD_REQUEST,
          'Error: Clave duplicada detectada al crear la entidad',
          'BaseService',
          HttpStatus.BAD_REQUEST,
          error.originalError.toString(),
        )*/
      } else if (error.originalError.toString().includes('FOREIGN KEY')) {
        throw new I18nError('error.dao.fk', HttpStatus.BAD_REQUEST, [
          getColumnNameFromEx(error.originalError.toString())!,
        ])
        /*throw new DataError(
          HttpStatus.BAD_REQUEST,
          'Error: datos foraneos columna: ' + getColumnNameFromEx(error.originalError.toString()),
          'BaseService',
          HttpStatus.BAD_REQUEST,
          error.originalError.toString(),
        )*/
      } else {
        throw error
      }
    }
  }

  public async updateById(id: number, payload: DeepPartial<T>, data?: SaveOptions) {
    const object = await this.findByIdOrFail(id)
    const entity = Object.assign(object, payload)
    await this.getRepository().save(entity, { data })
  }

  public async updateByIdCustom(id: number, identifier: string, payload: DeepPartial<T>, data?: SaveOptions) {
    const object = await this.findByIdOrFail(id, identifier)
    const entity = Object.assign(object, payload)
    return await this.getRepository().save(entity, { data })
  }
}
