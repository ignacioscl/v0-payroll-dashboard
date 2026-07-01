import { Repository, SelectQueryBuilder } from 'typeorm'
import { PaginationDto } from '../pagination/Pagination.dto'
import { I18nError } from '../errors/i18n.error'
import { HttpStatus } from '@nestjs/common'

export abstract class BaseRepository<
  T extends {},
  R extends { id?: number; orderBy?: { value: string; order: 'ASC' | 'DESC' }[] },
> extends Repository<T> {
  abstract fetch(payload: R): Promise<PaginationDto<T>>

  public getOrderBy(query: SelectQueryBuilder<T>, payload: R) {
    if (payload.orderBy) {
      console.log(payload.orderBy.toString())
      const jsonObject = JSON.parse(payload.orderBy.toString())
      jsonObject.forEach((o: any) => {
        query.orderBy(o.value, o.order)
      })
    }
  }

  paginator(payload: R extends PaginationDto<T> ? PaginationDto<T> : any) {
    const { page, pageSize } = payload
    const pageNumber = page ?? 0
    const take = pageSize ?? 10
    const skip = Math.max(0, pageNumber) * take

    return { pageNumber, take, skip, page, pageSize }
  }
  private convertToCamelCase = (str: string) => {
    return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase())
  }

  // Convert raw data
  public transformedRaw(raw: any): any[] {
    return raw.map((item: any) => {
      const newItem: any = {}
      for (const key in item) {
        newItem[this.convertToCamelCase(key)] = item[key]
      }
      return newItem
    })
  }

  protected async applyPagination(
    query: SelectQueryBuilder<T>,
    payload: { page?: number; pageSize?: number },
  ): Promise<PaginationDto<T>> {
    const { page, pageSize } = payload

    const shouldPaginate = page !== undefined && pageSize !== undefined && pageSize > 0

    if (
      (page !== undefined && (pageSize === undefined || pageSize <= 0)) ||
      (pageSize !== undefined && (page === undefined || page < 0))
    ) {
      throw new I18nError('common.error.pagination.data.error', HttpStatus.BAD_REQUEST)
    }

    if (!shouldPaginate) {
      const data = await query.getMany()
      return new PaginationDto({
        data,
        total: data.length,
        page: 0,
        pageSize: data.length,
        lastPage: 0,
      })
    }

    const pageNumber = page
    const take = pageSize
    const skip = Math.max(0, pageNumber) * take

    const [data, total] = await query.take(take).skip(skip).getManyAndCount()

    return new PaginationDto({
      data,
      total,
      page: pageNumber,
      pageSize: take,
      lastPage: total ? Math.ceil(total / take) : 0,
    })
  }

  protected async applyPaginationRaw(
    query: SelectQueryBuilder<T>,
    payload: { page?: number; pageSize?: number },
  ): Promise<PaginationDto<any>> {
    const { page, pageSize } = payload

    const shouldPaginate = page !== undefined && pageSize !== undefined && pageSize > 0

    if (
      (page !== undefined && (pageSize === undefined || pageSize <= 0)) ||
      (pageSize !== undefined && (page === undefined || page < 0))
    ) {
      throw new I18nError('common.error.pagination.data.error', HttpStatus.BAD_REQUEST)
    }

    if (!shouldPaginate) {
      const data = await query.getRawMany()
      return new PaginationDto({
        data: this.transformedRaw(data),
        total: data.length,
        page: 0,
        pageSize: data.length,
        lastPage: 0,
      })
    }

    const pageNumber = page
    const take = pageSize
    const skip = Math.max(0, pageNumber) * take

    // Get total count before pagination
    const total = await query.getCount()

    // Apply pagination and get raw data
    const { raw } = await query.take(take).skip(skip).getRawAndEntities()

    return new PaginationDto({
      data: this.transformedRaw(raw),
      total,
      page: pageNumber,
      pageSize: take,
      lastPage: total ? Math.ceil(total / take) : 0,
    })
  }
}
