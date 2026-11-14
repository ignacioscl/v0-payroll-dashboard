/**
 * `/api/health` mira la base (D9 de plans/plan-buenas-practicas-v0, 3.8): ok → 200; si no contesta en 3 s → 503 a los
 * 3 s. Con un DataSource falso (sin base) y el indicador real de Terminus.
 */
import { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { TerminusModule } from '@nestjs/terminus'
import { getDataSourceToken } from '@nestjs/typeorm'
import { Module } from '@nestjs/common'

import { HEALTH_DB_PING_TIMEOUT_MS, HealthController } from './health.controller'
import { JobsHealthIndicator } from '../../jobs/jobs-health.indicator'
import { EmailHealthIndicator } from '../../commons/email/email-health.indicator'
import { SRS_CONNECTION } from '../../srs/srs.datasource'

let hang = false
const fakeDataSource = {
  options: { type: 'mysql' },
  // Colgada: nunca contesta. Si el corte de 3 s no anduviera, el pedido no volvería nunca.
  query: () => (hang ? new Promise(() => undefined) : Promise.resolve([{ 1: 1 }])),
}

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [
    { provide: getDataSourceToken(SRS_CONNECTION), useValue: fakeDataSource },
    { provide: JobsHealthIndicator, useValue: { isHealthy: jest.fn() } },
    { provide: EmailHealthIndicator, useValue: { isHealthy: jest.fn() } },
  ],
})
class HealthProbeModule {}

let app: INestApplication
let url: string
beforeAll(async () => {
  app = await NestFactory.create(HealthProbeModule, { logger: false })
  await app.listen(0, '127.0.0.1')
  url = await app.getUrl()
})
afterAll(() => app.close())

describe('GET /health', () => {
  it('con la base contestando: 200', async () => {
    hang = false
    const res = await fetch(`${url}/health`)
    expect(res.status).toBe(200)
    expect((await res.json()).info.database.status).toBe('up')
  })

  it('si la base no contesta: 503 (corta a los HEALTH_DB_PING_TIMEOUT_MS)', async () => {
    hang = true
    const started = Date.now()
    const res = await fetch(`${url}/health`)
    expect(res.status).toBe(503)
    // No antes del corte; el tope de arriba es amplio porque en el build de Docker la máquina va cargada.
    expect(Date.now() - started).toBeGreaterThanOrEqual(HEALTH_DB_PING_TIMEOUT_MS - 100)
  }, 30_000)
})
