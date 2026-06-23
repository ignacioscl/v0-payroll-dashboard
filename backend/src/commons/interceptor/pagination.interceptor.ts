/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-param-reassign */
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Request } from 'express'
import { map, Observable } from 'rxjs'

@Injectable()
export class PaginationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map(data => {
        if (data?.total !== undefined && data?.page !== undefined && data?.pageSize !== undefined) {
          const request = context.switchToHttp().getRequest<Request>()
          const nextPage = data.page + 1
          const nextQuery =
            nextPage <= data.lastPage
              ? new URLSearchParams({
                  ...request.query,
                  page: nextPage.toString(),
                  pageSize: data.pageSize.toString(),
                })
              : null
          data.next = nextQuery && `${request.path}?${nextQuery}`

          const prevPage = data.page - 1
          const prevQuery =
            prevPage <= 0
              ? null
              : new URLSearchParams({
                  ...request.query,
                  page: prevPage.toString(),
                  pageSize: data.pageSize.toString(),
                })
          data.previous = prevQuery && `${request.path}?${prevQuery}`
        }
        return data
      }),
    )
  }
}
