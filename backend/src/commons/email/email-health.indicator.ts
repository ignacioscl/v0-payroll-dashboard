import { Inject, Injectable } from '@nestjs/common'
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus'

import { EMAIL_CONFIG, EmailConfig } from './email.config'

/**
 * Indicador `email` de `GET /api/health/jobs` (plans/plan-nest-email §8.8): `down` (503) si en PROD
 * el módulo no está en `live` (apagado por configuración o redirigido). Sin handshake SMTP: eso es
 * `verify()`, desde el CLI. `/api/health` no se toca.
 */
@Injectable()
export class EmailHealthIndicator extends HealthIndicator {
  constructor(@Inject(EMAIL_CONFIG) private readonly config: EmailConfig) {
    super()
  }

  async isHealthy(): Promise<HealthIndicatorResult> {
    const { mode, isProd, problems } = this.config
    const healthy = !isProd || mode === 'live'
    const result = this.getStatus('email', healthy, healthy ? { mode } : { mode, problems })
    if (!healthy) throw new HealthCheckError(`email: mode=${mode} in production`, result)
    return result
  }
}
