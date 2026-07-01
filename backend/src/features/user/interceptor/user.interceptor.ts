/* eslint-disable @typescript-eslint/no-explicit-any */
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { instanceToPlain } from 'class-transformer'
import { map, Observable } from 'rxjs'

@Injectable()
export class SerializerInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      // eslint-disable-next-line consistent-return
      map(response => {
        if (Array.isArray(response?.data)) {
          const { data } = response
          const serialized = data.map((user: { [x: string]: any; password: any }) => {
            return instanceToPlain(user)
          })
          return { ...response, data: serialized }
        }
        if (response) {
          return instanceToPlain(response)
        }
      }),
    )
  }
}
