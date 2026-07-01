import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

@Injectable()
export class TrimResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map(data => this.trimValues(data)))
  }

  private trimValues(value: any): any {
    if (Array.isArray(value)) {
      return value.map(item => this.trimValues(item))
    } else if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
      return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, this.trimValues(val)]))
    } else if (typeof value === 'string') {
      return value.trim()
    }
    return value
  }
}
