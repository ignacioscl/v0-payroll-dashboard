/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, Logger, LoggerService, OnApplicationBootstrap } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from './srs.datasource'

/**
 * Límite de ESPERA de conexión del pool 'srs' (mysql2).
 *
 * mysql2 encola sin temporizador cuando las `connectionLimit` conexiones están ocupadas
 * (`waitForConnections: true`, `queueLimit: 0`, sin acquireTimeout): la pantalla queda
 * colgada sin error ni log. Esto envuelve `pool.getConnection` para que, pasado el límite,
 * el pedido reciba un 503 «ocupado» (lo responde `I18nErrorFilter` por `httpStatus`).
 *
 * Sólo limita la espera: una consulta que ya tiene su conexión no se corta.
 * Plan: plans/plan-pool-v0-saturacion/PLAN.md §2.
 */
export const DB_POOL_BUSY = 'DB_POOL_BUSY'
export const DB_POOL_BUSY_MESSAGE = 'The system is busy right now. Please try again in a minute.'

const DEFAULT_ACQUIRE_TIMEOUT_MS = 20000
const WRAPPED = Symbol('srsAcquireWrapped')

type GetConnectionCb = (err: any, conn?: any) => void

export function poolBusyError(): Error & { httpStatus: number; code: string } {
  return Object.assign(new Error(DB_POOL_BUSY_MESSAGE), { httpStatus: 503, code: DB_POOL_BUSY })
}

export function isPoolBusyError(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === DB_POOL_BUSY
}

export function resolveAcquireTimeoutMs(raw: string | undefined): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ACQUIRE_TIMEOUT_MS
}

/** Sólo para el log: lee campos privados de mysql2, sin romper si cambian. */
function poolStatsLine(pool: any, timeoutMs: number): string {
  try {
    const all = pool._allConnections?.length ?? '?'
    const free = pool._freeConnections?.length ?? 0
    const inUse = typeof all === 'number' ? all - free : '?'
    const limit = pool.config?.connectionLimit ?? '?'
    const waiting = pool._connectionQueue?.length ?? '?'
    return `SRS pool busy: waited ${timeoutMs} ms; in use ${inUse}/${limit}, waiting ${waiting}`
  } catch {
    return `SRS pool busy: waited ${timeoutMs} ms`
  }
}

export function installAcquireTimeout(pool: any, timeoutMs: number, logger: LoggerService): void {
  if (!pool || typeof pool.getConnection !== 'function' || pool[WRAPPED]) return
  const original = pool.getConnection.bind(pool)
  pool.getConnection = (cb: GetConnectionCb) => {
    // releaseConnection de mysql2 re-llama this.getConnection(cb) con un callback que ya
    // es nuestro (lib/base/pool.js:80-84): ése pasa directo, sin un segundo temporizador.
    if ((cb as any)[WRAPPED]) return original(cb)
    let done = false
    const timer = setTimeout(() => {
      if (done) return
      done = true
      logger.warn(poolStatsLine(pool, timeoutMs))
      cb(poolBusyError())
    }, timeoutMs)
    const wrapped: GetConnectionCb = (err, conn) => {
      if (done) {
        // Llegó después del límite: se devuelve en el acto (pasa al siguiente de la cola).
        conn?.release?.()
        return
      }
      done = true
      clearTimeout(timer)
      cb(err, conn)
    }
    ;(wrapped as any)[WRAPPED] = true
    return original(wrapped)
  }
  pool[WRAPPED] = true
}

@Injectable()
export class SrsPoolAcquireTimeout implements OnApplicationBootstrap {
  private readonly logger = new Logger(SrsPoolAcquireTimeout.name)

  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  onApplicationBootstrap(): void {
    const pool = (this.srs.driver as any).pool
    const ms = resolveAcquireTimeoutMs(process.env.DB_POOL_ACQUIRE_TIMEOUT_MS)
    if (!pool) {
      this.logger.warn('SRS pool not found; acquire timeout not installed')
      return
    }
    installAcquireTimeout(pool, ms, this.logger)
    this.logger.log(`SRS pool acquire timeout: ${ms} ms`)
  }
}
