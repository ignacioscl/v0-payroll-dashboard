/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tiempo máximo para conectar a MySQL, explícito y con nombre (plans/plan-buenas-practicas-v0, 2.13.4).
 * El corte de 120 s por sentencia es de la base de PROD y no tiene test acá: se controla en el deploy
 * con `SELECT @@global.max_statement_time`.
 */
import { createServer, Server, Socket } from 'node:net'
import { DataSource } from 'typeorm'

import { DB_CONNECT_TIMEOUT_MS } from './db-timeouts'
import { dataSourceOptions } from './typeorm.config'
import { srsDataSourceOptions } from './srs/srs.datasource'
import { jobsDataSourceOptions } from './jobs/jobs.datasource'

const ALL = { default: dataSourceOptions, srs: srsDataSourceOptions, jobs: jobsDataSourceOptions }

describe('tiempos de MySQL', () => {
  it.each(Object.entries(ALL))('%s tiene connectTimeout = DB_CONNECT_TIMEOUT_MS', (_name, opts) => {
    expect((opts as any).connectTimeout).toBe(DB_CONNECT_TIMEOUT_MS)
  })

  it.each(Object.entries(ALL))('%s no tiene opciones de SQL Server (requestTimeout, options)', (_name, opts) => {
    expect((opts as any).requestTimeout).toBeUndefined()
    expect((opts as any).options).toBeUndefined()
  })

  describe('contra un servidor que acepta y no contesta', () => {
    let server: Server
    const sockets: Socket[] = []
    let port: number

    beforeAll(async () => {
      server = createServer((s) => sockets.push(s))
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
      port = (server.address() as any).port
    })
    afterAll(async () => {
      sockets.forEach((s) => s.destroy())
      await new Promise((r) => server.close(r))
    })

    it('initialize() falla dentro del tiempo de conexión', async () => {
      const ds = new DataSource({
        ...(srsDataSourceOptions as any),
        name: 'timeout-probe',
        host: '127.0.0.1',
        port,
        connectTimeout: 300,
        entities: [],
        logging: false,
      })
      const started = Date.now()
      await expect(ds.initialize()).rejects.toThrow()
      expect(Date.now() - started).toBeLessThan(3_000)
    })
  })
})
