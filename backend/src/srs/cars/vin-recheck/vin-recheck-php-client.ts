import { Injectable } from '@nestjs/common'
import http from 'node:http'
import https from 'node:https'

/**
 * Llamada Nest → PHP del job `car-vin-recheck` (plans/plan-vin-recheck §3.4): un POST por auto a
 * `php/api/vin-recheck.php` con el token de máquina en `X-Job-Token`. Mismo patrón que
 * `billing/invoice-export-php-client.ts` (node:http, JSON de ErrorManager), sin tocar ese cliente.
 */

export const VIN_RECHECK_PATH = '/php/api/vin-recheck.php'
/** Los tres proveedores suman como mucho 4 + 6 + 30 s (VinDecoderService); 120 s deja margen. */
export const VIN_RECHECK_TIMEOUT_MS = 120_000

export interface VinRecheckCarResult {
  idCar: number
  idDealer: number
  typeApi: string
  before: { idMake: number; make: string; idModel: number; model: string; year: number }
  after: { idMake: number | null; idModel: number | null; year: number; typeApi: string }
  makeOk: number
  modelOk: number
  yearOk: number
}

export interface VinRecheckData {
  skipped?: string
  resolved?: boolean
  applied?: boolean
  reason?: string
  provider?: string
  api?: { make: string; model: string; year: number }
  cars?: VinRecheckCarResult[]
}

export type VinRecheckResponse = { status: 'success' | 'fail'; message: string; data: VinRecheckData | null }

export type PostVinRecheck = (opts: {
  baseUrl: string
  token: string
  idCar: number
  dryRun: boolean
  idJobRun: number | null
  timeoutMs?: number
}) => Promise<VinRecheckResponse>

/** Un auto; el JSON de ErrorManager, o un Error que dice qué pasó (red, timeout, respuesta rara). */
export const postVinRecheck: PostVinRecheck = (opts) => {
  const url = new URL(VIN_RECHECK_PATH, `${opts.baseUrl.replace(/\/$/, '')}/`)
  const lib = url.protocol === 'https:' ? https : http
  const body = Buffer.from(JSON.stringify({ idCar: opts.idCar, dryRun: opts.dryRun, idJobRun: opts.idJobRun }), 'utf8')
  const headers: Record<string, string | number> = {
    'X-Job-Token': opts.token,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Content-Length': body.length,
  }
  return new Promise((resolve, reject) => {
    const req = lib.request(url, { method: 'POST', headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let parsed: any
        try {
          parsed = JSON.parse(text)
        } catch {
          reject(new Error(`respuesta inesperada del PHP (HTTP ${res.statusCode})`))
          return
        }
        resolve({
          status: parsed?.status === 'success' ? 'success' : 'fail',
          message: String(parsed?.error?.message ?? '') || `HTTP ${res.statusCode}`,
          data: (parsed?.data ?? null) as VinRecheckData | null,
        })
      })
      res.on('error', reject)
    })
    req.setTimeout(opts.timeoutMs ?? VIN_RECHECK_TIMEOUT_MS, () => {
      req.destroy(new Error('el PHP tardó demasiado en responder'))
    })
    req.on('error', (e) => reject(new Error(`no se pudo llegar al PHP: ${e.message}`)))
    req.write(body)
    req.end()
  })
}

/** El cliente como provider, para que el job lo reciba inyectado (y el test lo cambie por un mock). */
@Injectable()
export class VinRecheckPhpClient {
  post: PostVinRecheck = (opts) => postVinRecheck(opts)
}
