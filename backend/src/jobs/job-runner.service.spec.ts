import { JobRunnerService, isRetryableJobError } from './job-runner.service'
import { emptyJobResult, JobHandler } from './job.interface'

function setup(lockValue: number, handler: JobHandler<any>) {
  const queries: string[] = []
  const qr = {
    connect: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockImplementation((sql: string) => {
      queries.push(sql)
      return Promise.resolve(sql.includes('GET_LOCK') ? [{ l: lockValue }] : [{ r: 1 }])
    }),
  }
  // `IS_FREE_LOCK`: libre salvo el lock de `busyLock` (un CLI que sigue corriendo).
  const ds = {
    createQueryRunner: () => qr,
    query: jest.fn().mockImplementation((_sql: string, [lock]: string[]) =>
      Promise.resolve([{ f: lock === 'srs_jobs:busy' ? 0 : 1 }]),
    ),
  }
  let nextId = 1
  const runs = {
    start: jest.fn().mockImplementation((r: any) => Promise.resolve({ ...r, id: nextId++ })),
    finish: jest.fn().mockImplementation((run: any, status: string, _res: any, error: string | null) =>
      Promise.resolve({ ...run, status, error }),
    ),
    runningOf: jest.fn().mockResolvedValue([]),
    markInterrupted: jest.fn().mockImplementation((ids: number[]) => Promise.resolve(ids.length)),
  }
  const logs = { append: jest.fn().mockResolvedValue(undefined) }
  const alerts = { onFailed: jest.fn().mockResolvedValue(undefined) }
  const registry = { get: () => handler }
  const runner = new JobRunnerService(registry as any, runs as any, logs as any, alerts as any, ds as any)
  return { runner, runs, logs, alerts, qr, queries }
}

describe('JobRunnerService', () => {
  it('lock ocupado → corrida skipped, el job no corre', async () => {
    const handler = { name: 'x', run: jest.fn() }
    const { runner, runs, qr } = setup(0, handler)
    const out = await runner.run('x', {}, 'api')
    expect(out.status).toBe('skipped')
    expect(handler.run).not.toHaveBeenCalled()
    expect(runs.start).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped', error: 'lock busy' }))
    expect(qr.release).toHaveBeenCalled()
  })

  it('error de conexión → un solo reintento', async () => {
    const err = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })
    const handler = { name: 'x', run: jest.fn().mockRejectedValueOnce(err).mockResolvedValueOnce(emptyJobResult()) }
    const { runner, queries } = setup(1, handler)
    const out = await runner.run('x', {}, 'cli')
    expect(out.status).toBe('ok')
    expect(handler.run).toHaveBeenCalledTimes(2)
    expect(queries.some((q) => q.includes('RELEASE_LOCK'))).toBe(true)
  })

  it('error de datos → failed sin reintento, con alerta', async () => {
    const handler = { name: 'x', run: jest.fn().mockRejectedValue(new Error('Unknown column')) }
    const { runner, alerts, logs } = setup(1, handler)
    const out = await runner.run('x', {}, 'cron')
    expect(out.status).toBe('failed')
    expect(handler.run).toHaveBeenCalledTimes(1)
    expect(alerts.onFailed).toHaveBeenCalled()
    expect(logs.append).toHaveBeenCalledWith(expect.any(Number), 'error', 'Unknown column', expect.anything())
  })

  it('unidades fallidas → la corrida termina failed', async () => {
    const handler = { name: 'x', run: jest.fn().mockResolvedValue({ ...emptyJobResult(), itemsTotal: 3, itemsFailed: 1 }) }
    const { runner } = setup(1, handler)
    expect((await runner.run('x', {}, 'cron')).status).toBe('failed')
  })

  it('al arrancar: running con el lock libre → failed, aunque tenga minutos; con el lock tomado no se toca', async () => {
    const { runner, runs } = setup(1, { name: 'x', run: jest.fn() })
    runs.runningOf.mockResolvedValue([
      { id: 2, jobName: 'noop' },
      { id: 7, jobName: 'busy' },
    ])
    await runner.onModuleInit()
    expect(runs.markInterrupted).toHaveBeenCalledWith([2])
  })

  it('isRetryableJobError', () => {
    expect(isRetryableJobError({ code: 'ER_LOCK_DEADLOCK' })).toBe(true)
    expect(isRetryableJobError({ code: 'ER_PARSE_ERROR' })).toBe(false)
  })
})
