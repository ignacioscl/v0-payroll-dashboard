import { HttpStatus, NotFoundException } from '@nestjs/common'
import { DeepPartial, FindManyOptions, FindOneOptions, SaveOptions } from 'typeorm'

import { getColumnNameFromEx } from '../utils/utils'
import { BaseRepository } from '../repository/base.repository'
import { I18nError } from '../errors/i18n.error'
import { PaginationDto, RequestPaginationDto } from '../pagination/Pagination.dto'

export abstract class GlobalBaseService<T extends {}, R extends { id?: number }> {
  protected abstract getRepository(): BaseRepository<T, R>

  async fetch(payload: R): Promise<PaginationDto<T>> {
    return this.getRepository().fetch(payload)
  }

  async getById(id: number): Promise<T> {
    const obj = await this.fetch({ id: id } as any)
    if (obj.data && obj.data.length == 1) {
      return obj.data[0]
    }
    throw new I18nError('error.dao.idNotFound', HttpStatus.NOT_FOUND)
    //throw new DataError(HttpStatus.NOT_FOUND, 'id no encontrado', 'error')
  }
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

  public async findById(id: number, identifier = 'id') {
    return this.getRepository().createQueryBuilder().where(`${identifier} = :id`, { id }).getOne()
  }

  public async findByIdOrFail(id: number, identifier = 'id'): Promise<T> {
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
  public async deleteHardOrFail(id: number, identifier?: string) {
    const idKey = identifier ?? 'id'
    await this.findByIdOrFail(id, idKey)
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
      if (error.originalError?.toString().includes('duplicate key')) {
        //status: number, message: string, type = 'DataError', httpStatus?: HttpStatus, description?: string
        throw new I18nError('error.dao.duplicatedKey', HttpStatus.BAD_REQUEST)
        /*throw new DataError(
          HttpStatus.BAD_REQUEST,
          'Error: Clave duplicada detectada al crear la entidad',
          'BaseService',
          HttpStatus.BAD_REQUEST,
          error.originalError.toString(),
        )*/
      } else if (error.originalError?.toString().includes('FOREIGN KEY')) {
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
    return this.getRepository().save(entity, { data })
  }
}
