import { JobContext } from '../../../jobs/job.interface'
import { CarVinRecheckSourceRepository, VinRecheckCandidate } from './car-vin-recheck-source.repository'
import { CarVinRecheckJob, vinRecheckWindow } from './car-vin-recheck.job'
import { VinRecheckPhpClient, VinRecheckResponse } from './vin-recheck-php-client'

const ok = (data: VinRecheckResponse['data']): VinRecheckResponse => ({ status: 'success', message: '', data })

const car = (idCar: number) => ({
  idCar,
  idDealer: 17,
  typeApi: 'vinpattern',
  before: { idMake: 1, make: 'A', idModel: 2, model: 'B', year: 2020 },
  after: { idMake: 3, idModel: 4, year: 2021, typeApi: 'nhtsa' },
  makeOk: 0,
  modelOk: 0,
  yearOk: 0,
})

function setup(candidates: VinRecheckCandidate[], post: (idCar: number, dryRun: boolean) => Promise<VinRecheckResponse>) {
  const source = { listCandidates: jest.fn(async () => candidates) } as unknown as CarVinRecheckSourceRepository
  const php = { post: jest.fn(async (o: { idCar: number; dryRun: boolean }) => post(o.idCar, o.dryRun)) }
  const job = new CarVinRecheckJob(source, php as unknown as VinRecheckPhpClient)
  const lines: { level: string; message: string }[] = []
  const ctx = (dryRun = false): JobContext => ({
    runId: 57,
    trigger: 'cli',
    dryRun,
    force: false,
    log: async (level, message) => {
      lines.push({ level, message })
    },
  })
  return { job, source, php, ctx, lines }
}

const candidate = (idCar: number): VinRecheckCandidate => ({ idCar, vin: `VIN${idCar}`, idDealer: 17, fechaIngreso: '2026-09-01' })

describe('vinRecheckWindow', () => {
  it('va de hoy − 180 a hoy − 15, los dos incluidos', () => {
    expect(vinRecheckWindow('2026-10-20', 15, 180)).toEqual({ desde: '2026-04-23', hasta: '2026-10-05' })
  })

  it('cruza fin de año y años bisiestos sin correrse', () => {
    expect(vinRecheckWindow('2028-03-01', 15, 180)).toEqual({ desde: '2027-09-03', hasta: '2028-02-15' })
  })
})

describe('CarVinRecheckJob', () => {
  const env = { ...process.env }
  beforeEach(() => {
    process.env.VIN_RECHECK_PHP_TOKEN = 'tok'
    process.env.SRS_API_URL = 'http://srs.test'
    delete process.env.VIN_RECHECK_DAYS_FROM
    delete process.env.VIN_RECHECK_DAYS_TO
  })
  afterAll(() => {
    process.env = env
  })

  it('sin VIN_RECHECK_PHP_TOKEN falla antes de la primera llamada', async () => {
    delete process.env.VIN_RECHECK_PHP_TOKEN
    const { job, php, source, ctx } = setup([candidate(1)], async () => ok({ resolved: false }))
    await expect(job.run({}, ctx())).rejects.toThrow('VIN_RECHECK_PHP_TOKEN')
    expect(source.listCandidates).not.toHaveBeenCalled()
    expect(php.post).not.toHaveBeenCalled()
  })

  it('cada respuesta va a su contador', async () => {
    const respuestas: Record<number, () => Promise<VinRecheckResponse>> = {
      1: async () => ok({ skipped: 'type_api nhtsa' }),
      2: async () => ok({ resolved: false }),
      3: async () => ok({ resolved: false, reason: 'make_7091' }),
      4: async () => ok({ resolved: true, applied: true, provider: 'nhtsa', cars: [car(4), car(40)] }),
      5: async () => ({ status: 'fail', message: 'boom', data: null }),
      6: async () => {
        throw new Error('no se pudo llegar al PHP: ECONNREFUSED')
      },
      7: async () => ok({ resolved: true, applied: true, provider: 'autodev', cars: [car(7)] }),
    }
    const { job, php, ctx, lines } = setup([1, 2, 3, 4, 5, 6, 7].map(candidate), (id) => respuestas[id]())
    const r = await job.run({}, ctx())
    expect(php.post).toHaveBeenCalledTimes(7)
    expect(r.itemsTotal).toBe(7)
    expect(r.itemsSkipped).toBe(3)
    expect(r.itemsFailed).toBe(2)
    expect(r.itemsChanged).toBe(3)
    expect(r.summary).toMatchObject({
      candidatos: 7,
      resueltos: 2,
      autosPisados: 3,
      sinRespuesta: 2,
      salteados: 1,
      fallidos: 2,
      porProveedor: { nhtsa: 1, autodev: 1 },
    })
    expect(lines.filter((l) => l.level === 'error').map((l) => l.message)).toEqual([
      'auto 5: boom',
      'auto 6: no se pudo llegar al PHP: ECONNREFUSED',
    ])
  })

  it('dryRun llega al PHP y cuenta un cambio por auto resuelto', async () => {
    const { job, php, ctx } = setup([candidate(9)], async (_id, dryRun) =>
      ok({ resolved: true, applied: !dryRun, provider: 'nhtsa', cars: [car(9), car(90)] }),
    )
    const r = await job.run({}, ctx(true))
    expect(php.post.mock.calls[0][0]).toMatchObject({ idCar: 9, dryRun: true, idJobRun: 57, token: 'tok', baseUrl: 'http://srs.test' })
    expect(r.itemsChanged).toBe(1)
    expect(r.summary).toMatchObject({ autosPisados: 0, resueltos: 1 })
  })

  it('llama a todos los candidatos, sin tope (D11): 250 de 250', async () => {
    const lista = Array.from({ length: 250 }, (_, i) => candidate(i + 1))
    const { job, php, ctx } = setup(lista, async () => ok({ resolved: false }))
    const r = await job.run({}, ctx())
    expect(php.post).toHaveBeenCalledTimes(250)
    expect(r.itemsTotal).toBe(250)
    expect(r.itemsSkipped).toBe(250)
  })

  it('con payload.idCar consulta solo ese auto, sin leer la ventana', async () => {
    const { job, php, source, ctx } = setup([candidate(1)], async () => ok({ skipped: 'type_api nhtsa' }))
    const r = await job.run({ idCar: 123 }, ctx())
    expect(source.listCandidates).not.toHaveBeenCalled()
    expect(php.post).toHaveBeenCalledTimes(1)
    expect(php.post.mock.calls[0][0]).toMatchObject({ idCar: 123 })
    expect(r.itemsSkipped).toBe(1)
  })

  it('lee la ventana de candidatos con los días del env', async () => {
    process.env.VIN_RECHECK_DAYS_FROM = '20'
    process.env.VIN_RECHECK_DAYS_TO = '30'
    const { job, source, ctx } = setup([], async () => ok({ resolved: false }))
    const r = await job.run({}, ctx())
    const [desde, hasta] = (source.listCandidates as jest.Mock).mock.calls[0]
    expect(r.summary).toMatchObject({ desde, hasta, candidatos: 0 })
    const { diffDays } = await import('../../payroll/snapshot/payroll-dates')
    expect(diffDays(desde, hasta)).toBe(10)
  })
})
