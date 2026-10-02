/* eslint-disable @typescript-eslint/no-explicit-any */
import 'dotenv/config'
import { createPool } from 'mysql2'

import {
  DB_POOL_BUSY,
  DB_POOL_BUSY_MESSAGE,
  installAcquireTimeout,
  isPoolBusyError,
  resolveAcquireTimeoutMs,
} from './srs-pool-acquire-timeout'

const silentLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as any

function getConn(pool: any): Promise<{ err: any; conn: any; ms: number }> {
  const t0 = Date.now()
  return new Promise((resolve) =>
    pool.getConnection((err: any, conn: any) => resolve({ err, conn, ms: Date.now() - t0 })),
  )
}

describe('resolveAcquireTimeoutMs', () => {
  it('default 20000 si falta o es inválido', () => {
    expect(resolveAcquireTimeoutMs(undefined)).toBe(20000)
    expect(resolveAcquireTimeoutMs('')).toBe(20000)
    expect(resolveAcquireTimeoutMs('abc')).toBe(20000)
    expect(resolveAcquireTimeoutMs('0')).toBe(20000)
    expect(resolveAcquireTimeoutMs('3000')).toBe(3000)
  })
})

describe('installAcquireTimeout (pool simulado)', () => {
  function fakePool() {
    const queue: Array<(err: any, conn?: any) => void> = []
    const pool: any = {
      released: 0,
      getConnection(cb: (err: any, conn?: any) => void) {
        queue.push(cb)
      },
    }
    const conn = { release: () => pool.released++ }
    return { pool, queue, conn }
  }

  // Node 22 deja `performance` de sólo lectura: jest 28 no puede falsearlo.
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['performance'] }))
  afterEach(() => jest.useRealTimers())

  it('vencido el límite, el que espera recibe 503 DB_POOL_BUSY', () => {
    const { pool } = fakePool()
    installAcquireTimeout(pool, 1000, silentLogger)
    const cb = jest.fn()
    pool.getConnection(cb)
    jest.advanceTimersByTime(999)
    expect(cb).not.toHaveBeenCalled()
    jest.advanceTimersByTime(1)
    expect(cb).toHaveBeenCalledTimes(1)
    const err = cb.mock.calls[0][0]
    expect(err.code).toBe(DB_POOL_BUSY)
    expect(err.httpStatus).toBe(503)
    expect(err.message).toBe(DB_POOL_BUSY_MESSAGE)
    expect(isPoolBusyError(err)).toBe(true)
  })

  it('la conexión que llega tarde se devuelve en el acto y no se entrega', () => {
    const { pool, queue, conn } = fakePool()
    installAcquireTimeout(pool, 1000, silentLogger)
    const cb = jest.fn()
    pool.getConnection(cb)
    jest.advanceTimersByTime(1000)
    queue[0](null, conn)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(pool.released).toBe(1)
  })

  it('la conexión que llega a tiempo se entrega y cancela el temporizador', () => {
    const { pool, queue, conn } = fakePool()
    installAcquireTimeout(pool, 1000, silentLogger)
    const cb = jest.fn()
    pool.getConnection(cb)
    queue[0](null, conn)
    jest.advanceTimersByTime(5000)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith(null, conn)
    expect(pool.released).toBe(0)
  })

  it('un callback ya envuelto (re-llamada interna de mysql2) no lleva un segundo temporizador', () => {
    const { pool, queue } = fakePool()
    installAcquireTimeout(pool, 1000, silentLogger)
    pool.getConnection(jest.fn())
    const inner = queue[0]
    pool.getConnection(inner)
    expect(queue[1]).toBe(inner)
  })

  it('instalar dos veces no envuelve dos veces', () => {
    const { pool } = fakePool()
    installAcquireTimeout(pool, 1000, silentLogger)
    const once = pool.getConnection
    installAcquireTimeout(pool, 1000, silentLogger)
    expect(pool.getConnection).toBe(once)
  })
})

// Pool real de mysql2 contra la base local (DB_* del .env). Sólo toma conexiones y hace SELECT 1.
describe('installAcquireTimeout (mysql2 real, base local)', () => {
  const hasDb = Boolean(process.env.DB_HOST && process.env.DB_USERNAME)
  const itDb = hasDb ? it : it.skip

  itDb('pool de 1: el segundo espera ~1 s y falla; al liberar, nada queda tomado ni encolado', async () => {
    const pool: any = createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 3306),
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      connectionLimit: 1,
    })
    try {
      installAcquireTimeout(pool, 1000, silentLogger)

      const first = await getConn(pool)
      expect(first.err).toBeNull()

      const second = await getConn(pool)
      expect(second.err?.code).toBe(DB_POOL_BUSY)
      expect(second.err?.httpStatus).toBe(503)
      expect(second.ms).toBeGreaterThanOrEqual(950)
      expect(second.ms).toBeLessThan(1500)

      // El que se cansó sigue en la cola de mysql2: al liberar, la recibe y la devuelve sola.
      first.conn.release()
      await new Promise((r) => setTimeout(r, 50))

      const third = await getConn(pool)
      expect(third.err).toBeNull()
      expect(third.ms).toBeLessThan(200)
      const [rows] = await third.conn.promise().query('SELECT 1 AS ok')
      expect(rows[0].ok).toBe(1)
      third.conn.release()

      expect(pool._allConnections.length).toBe(1)
      expect(pool._freeConnections.length).toBe(1)
      expect(pool._connectionQueue.length).toBe(0)
    } finally {
      await new Promise((r) => pool.end(r))
    }
  })
})
