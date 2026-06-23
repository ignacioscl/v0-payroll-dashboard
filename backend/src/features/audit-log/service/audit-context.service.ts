import { Injectable } from '@nestjs/common'
import { AsyncLocalStorage } from 'async_hooks'

export interface AuditContext {
  userId?: number
  ipAddress?: string
}

@Injectable()
export class AuditContextService {
  private readonly asyncLocalStorage = new AsyncLocalStorage<AuditContext>()

  /**
   * Ejecuta una función dentro de un contexto de auditoría
   */
  run<T>(context: AuditContext, callback: () => T): T {
    return this.asyncLocalStorage.run(context, callback)
  }

  /**
   * Obtiene el contexto de auditoría actual
   */
  getContext(): AuditContext | undefined {
    return this.asyncLocalStorage.getStore()
  }
}
