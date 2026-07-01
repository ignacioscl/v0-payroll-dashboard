import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable } from 'rxjs'
import { AuditContextService } from '../service/audit-context.service'
import { RequestWithUser } from 'src/features/auth/types/request.user.type'

@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  constructor(private readonly auditContextService: AuditContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<RequestWithUser & { ip?: string; connection?: any }>()
    const user = request.user
    const ipAddress =
      request.ip || request.headers.get?.('x-forwarded-for') || request.connection?.remoteAddress || 'unknown'

    const auditContext = {
      userId: user?.id,
      ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
    }

    console.log('🔍 AuditContextInterceptor: Estableciendo contexto', auditContext)

    return new Observable(subscriber => {
      this.auditContextService.run(auditContext, () => {
        next.handle().subscribe({
          next: value => subscriber.next(value),
          error: error => subscriber.error(error),
          complete: () => subscriber.complete(),
        })
      })
    })
  }
}

