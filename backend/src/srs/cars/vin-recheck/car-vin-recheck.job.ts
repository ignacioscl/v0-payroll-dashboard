import { BadRequestException, Injectable } from '@nestjs/common'

import { emptyJobResult, JobContext, JobForm, JobHandler, JobResult } from '../../../jobs/job.interface'
import { addDays, PAYROLL_TIME_ZONE, todayInZone } from '../../payroll/snapshot/payroll-dates'
import { CarVinRecheckSourceRepository, VinRecheckCandidate } from './car-vin-recheck-source.repository'
import { srsApiUrl, vinRecheckDaysFrom, vinRecheckDaysTo, vinRecheckPhpToken } from './vin-recheck-env'
import { VinRecheckPhpClient } from './vin-recheck-php-client'

export const CAR_VIN_RECHECK_JOB = 'car-vin-recheck'

export interface CarVinRecheckPayload {
  /** Un auto puntual, sin ventana de fechas (corrida a mano). */
  idCar?: number
}

/**
 * Ventana de altas que se consultan: desde hace `daysTo` hasta hace `daysFrom` días, los dos
 * extremos incluidos (D5: 15 a 180). `hoy` es la fecha de New York.
 */
export function vinRecheckWindow(hoy: string, daysFrom: number, daysTo: number): { desde: string; hasta: string } {
  return { desde: addDays(hoy, -daysTo), hasta: addDays(hoy, -daysFrom) }
}

/**
 * Reconsulta diaria de los VIN resueltos por patrón (plans/plan-vin-recheck §3.5). El Nest elige los
 * candidatos y llama al PHP uno por uno, en serie; el PHP consulta los proveedores y, si alguno lo
 * resuelve, pisa el auto y escribe su log en la misma transacción. El Nest no escribe en ninguna base.
 * `dryRun` llega al PHP, que no escribe nada (D12). `force` no aplica: se acepta y se ignora.
 */
@Injectable()
export class CarVinRecheckJob implements JobHandler<CarVinRecheckPayload> {
  readonly name = CAR_VIN_RECHECK_JOB
  readonly form: JobForm = { label: 'VIN recheck', fields: [] }

  constructor(
    private readonly source: CarVinRecheckSourceRepository,
    private readonly php: VinRecheckPhpClient,
  ) {}

  async run(payload: CarVinRecheckPayload, ctx: JobContext): Promise<JobResult> {
    const token = vinRecheckPhpToken()
    if (!token) throw new Error('Falta VIN_RECHECK_PHP_TOKEN: sin él el PHP rechaza la reconsulta')
    const baseUrl = srsApiUrl()
    if (!baseUrl) throw new Error('Falta SRS_API_URL: sin ella no se puede llamar al PHP')

    let idCar: number | null = null
    if (payload?.idCar !== undefined) {
      idCar = Number(payload.idCar)
      if (!Number.isInteger(idCar) || idCar <= 0) throw new BadRequestException('payload.idCar tiene que ser un id de auto')
    }

    const hoy = todayInZone(PAYROLL_TIME_ZONE)
    const { desde, hasta } = vinRecheckWindow(hoy, vinRecheckDaysFrom(), vinRecheckDaysTo())
    const candidatos: Pick<VinRecheckCandidate, 'idCar'>[] =
      idCar !== null ? [{ idCar }] : await this.source.listCandidates(desde, hasta)

    await ctx.log('info', 'parámetros', {
      desde,
      hasta,
      dryRun: ctx.dryRun,
      candidatos: candidatos.length,
      ...(idCar !== null ? { idCar } : {}),
    })

    const result = emptyJobResult()
    const counts = { resueltos: 0, autosPisados: 0, sinRespuesta: 0, salteados: 0, fallidos: 0 }
    const porProveedor: Record<string, number> = {}

    for (const c of candidatos) {
      result.itemsTotal++
      let res
      try {
        res = await this.php.post({ baseUrl, token, idCar: c.idCar, dryRun: ctx.dryRun, idJobRun: ctx.runId })
      } catch (e) {
        result.itemsFailed++
        counts.fallidos++
        await ctx.log('error', `auto ${c.idCar}: ${(e as Error)?.message ?? e}`)
        continue
      }
      const data = res.data
      if (res.status !== 'success' || !data) {
        result.itemsFailed++
        counts.fallidos++
        await ctx.log('error', `auto ${c.idCar}: ${res.message || 'respuesta sin datos'}`)
        continue
      }
      if (data.skipped) {
        result.itemsSkipped++
        counts.salteados++
        await ctx.log('info', `auto ${c.idCar} salteado: ${data.skipped}`)
        continue
      }
      if (!data.resolved) {
        result.itemsSkipped++
        counts.sinRespuesta++
        const motivo = data.reason ? ` (${data.reason})` : ''
        await ctx.log('info', `auto ${c.idCar}: sin respuesta de proveedores${motivo}`)
        continue
      }
      const provider = data.provider ?? '?'
      const cars = data.cars ?? []
      counts.resueltos++
      porProveedor[provider] = (porProveedor[provider] ?? 0) + 1
      if (!data.applied) {
        result.itemsChanged++
        await ctx.log('info', `auto ${c.idCar} resuelto por ${provider} (dryRun): ${cars.length} auto(s) se pisarían`, {
          api: data.api,
          cars,
        })
        continue
      }
      result.itemsChanged += cars.length
      counts.autosPisados += cars.length
      await ctx.log('info', `auto ${c.idCar} resuelto por ${provider}: ${cars.length} auto(s) pisado(s)`, {
        api: data.api,
        cars,
      })
    }

    result.summary = { desde, hasta, candidatos: candidatos.length, ...counts, porProveedor }
    return result
  }
}
