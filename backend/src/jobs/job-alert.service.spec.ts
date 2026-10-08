import { Logger } from '@nestjs/common'

import { SendEmailResult } from '../commons/email/email.types'
import { JobAlertService } from './job-alert.service'

const ENV_KEYS = ['NODE_ENV', 'JOBS_DEV_FORCE', 'JOBS_ALERT_EMAIL'] as const
const saved: Record<string, string | undefined> = {}

function result(over: Partial<SendEmailResult>): SendEmailResult {
  return {
    status: 'sent',
    mode: 'live',
    purpose: 'job-alert',
    sender: 'srs',
    subject: 's',
    to: ['juan@srs.test'],
    durationMs: 1,
    ...over,
  }
}

function setup(sendResult: SendEmailResult = result({ messageId: '<m>' })) {
  const email = { send: jest.fn().mockResolvedValue(sendResult) }
  const runs = {
    alertSentSince: jest.fn().mockResolvedValue(false),
    markAlertSent: jest.fn().mockResolvedValue(undefined),
  }
  const logs = { append: jest.fn().mockResolvedValue(undefined) }
  const service = new JobAlertService(email as any, runs as any, logs as any)
  const run = { id: 7, jobName: 'noop', trigger: 'cli', host: 'h', startedAt: '2026-10-06 10:00:00', error: 'boom', itemsFailed: 0 }
  return { service, email, runs, logs, run: run as any }
}

let warn: jest.SpyInstance
beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k]
  process.env.NODE_ENV = 'development'
  process.env.JOBS_DEV_FORCE = 'true'
  process.env.JOBS_ALERT_EMAIL = 'juan@srs.test'
  warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  jest.restoreAllMocks()
})

describe('JobAlertService (por el módulo de email)', () => {
  it('(a) dev sin JOBS_DEV_FORCE → «alert suppressed in development», no pide el mail', async () => {
    delete process.env.JOBS_DEV_FORCE
    const { service, email, logs, run } = setup()
    await service.onFailed(run)
    expect(email.send).not.toHaveBeenCalled()
    expect(logs.append).toHaveBeenCalledWith(7, 'warn', 'alert suppressed in development')
  })

  it('(b) ya se mandó una en la última hora → no llama', async () => {
    const { service, email, runs, run } = setup()
    runs.alertSentSince.mockResolvedValue(true)
    await service.onFailed(run)
    expect(email.send).not.toHaveBeenCalled()
  })

  it('(c) sent/live → markAlertSent y «alerta enviada a X»', async () => {
    const { service, runs, logs, run } = setup()
    await service.onFailed(run)
    expect(logs.append).toHaveBeenCalledWith(7, 'info', 'alerta enviada a juan@srs.test')
    expect(runs.markAlertSent).toHaveBeenCalledWith(run)
  })

  it('(d) sent/redirect → «(redirigida a Y)» y markAlertSent', async () => {
    const { service, runs, logs, run } = setup(result({ mode: 'redirect', to: ['dev@srs.test'], redirectedFrom: ['juan@srs.test'] }))
    await service.onFailed(run)
    expect(logs.append).toHaveBeenCalledWith(7, 'info', 'alerta enviada a juan@srs.test (redirigida a dev@srs.test)')
    expect(runs.markAlertSent).toHaveBeenCalled()
  })

  it('(e) suppressed → warn «alerta suprimida…», sin markAlertSent', async () => {
    const { service, runs, logs, run } = setup(
      result({ status: 'suppressed', mode: 'suppressed', reason: 'dev without EMAIL_DEV_REDIRECT_TO' }),
    )
    await service.onFailed(run)
    expect(logs.append).toHaveBeenCalledWith(
      7,
      'warn',
      'alerta suprimida (email suppressed: dev without EMAIL_DEV_REDIRECT_TO)',
    )
    expect(runs.markAlertSent).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })

  it('(f) failed → warn «no se pudo enviar la alerta: …», sin mark', async () => {
    const { service, runs, logs, run } = setup(result({ status: 'failed', error: 'ETIMEDOUT: Connection timeout' }))
    await service.onFailed(run)
    expect(logs.append).toHaveBeenCalledWith(7, 'warn', 'no se pudo enviar la alerta: ETIMEDOUT: Connection timeout')
    expect(runs.markAlertSent).not.toHaveBeenCalled()
  })

  it('(g) sin JOBS_ALERT_EMAIL → warn, sin pedir el mail', async () => {
    delete process.env.JOBS_ALERT_EMAIL
    const { service, email, logs, run } = setup()
    await service.onFailed(run)
    expect(email.send).not.toHaveBeenCalled()
    expect(logs.append).toHaveBeenCalledWith(7, 'warn', 'alerta no enviada: falta JOBS_ALERT_EMAIL')
  })

  it('(h) el pedido: job-alert, internal, [SRS jobs], solo texto', async () => {
    const { service, email, run } = setup()
    await service.onFailed(run)
    const sent = email.send.mock.calls[0][0]
    expect(sent).toMatchObject({ purpose: 'job-alert', audience: 'internal', to: 'juan@srs.test', subject: '[SRS jobs] noop failed' })
    expect(sent.text).toContain('Error: boom')
    expect(sent.html).toBeUndefined()
    expect(sent.template).toBeUndefined()
  })

  it('watchdog: mismo camino; markAlertSent solo con sent', async () => {
    const { service, email, runs, run } = setup(result({ status: 'suppressed', mode: 'suppressed', reason: 'x' }))
    await service.onWatchdog(run, 'payroll-snapshot', 'no run')
    expect(email.send.mock.calls[0][0].subject).toBe('[SRS jobs] payroll-snapshot: no successful daily run')
    expect(runs.markAlertSent).not.toHaveBeenCalled()
  })
})
