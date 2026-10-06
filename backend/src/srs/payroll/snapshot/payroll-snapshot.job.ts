import { BadRequestException, Injectable } from '@nestjs/common'

import { PayrollPeriodStateService } from '../../../features/payroll-period-state/service/payroll-period-state.service'
import { emptyJobResult, JobContext, JobForm, JobHandler, JobResult } from '../../../jobs/job.interface'
import { proratedDayId } from './payment-type-ids'
import { calculatePeriod } from './payroll-period.calculator'
import {
  addDays,
  addMonths,
  isYmd,
  maxDate,
  minDate,
  PAYROLL_TIME_ZONE,
  snapshotCutoff,
  todayInZone,
  utcDateTime,
} from './payroll-dates'
import { PayrollFingerprintRepository, periodFingerprint, ProviderFingerprintSource } from './payroll-fingerprint.repository'
import { PayrollPeriod, PayrollProviderConfig, SnapshotRow } from './payroll-snapshot.types'
import { PayrollSnapshotWriter } from './payroll-snapshot.writer'
import { PayrollSourceRepository } from './payroll-source.repository'

export const PAYROLL_SNAPSHOT_JOB = 'payroll-snapshot'

/**
 * Versión del cálculo. Subirla cuando cambia una regla o una función almacenada que el cálculo
 * usa: la huella cambia y la corrida siguiente recalcula todos los períodos de la ventana.
 */
export const CALC_VERSION = 1

/** Los períodos que terminaron hace menos de 30 días se recalculan siempre. */
const ALWAYS_RECALC_DAYS = 30

/** Primer día del snapshot (decisión D: 2026-01-01). */
export function payrollSnapshotFrom(): string {
  const raw = process.env.PAYROLL_SNAPSHOT_FROM?.trim()
  return isYmd(raw) ? raw : '2026-01-01'
}

/** Meses hacia atrás que mira la huella (decisión D: 5). Lo anterior queda congelado. */
function checkMonths(): number {
  const n = Number(process.env.PAYROLL_SNAPSHOT_CHECK_MONTHS)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5
}

export interface PayrollSnapshotPayload {
  idContratista?: number
  desde?: string
  hasta?: string
}

interface DryRunTotals {
  [key: string]: { monto: number; montoTax: number; horas: number; filas: number }
}

const round4 = (n: number): number => Math.round((n + Number.EPSILON) * 1e4) / 1e4

/**
 * Snapshot diario de payroll (plan §6.3–§6.4). Por empresa y período:
 *  - corte = hoy − 2 (New York): nunca entran datos de hoy ni de ayer;
 *  - sin rango: los períodos que terminan dentro de los últimos 5 meses (ventana); los anteriores
 *    quedan congelados;
 *  - recalcula si `force`, si el período terminó hace menos de 30 días, si no tiene estado, si
 *    cambió la huella o si cambió `CALC_VERSION`;
 *  - escribe con DELETE + INSERT en una transacción por período; si un período falla, sigue.
 * `dryRun` calcula sin escribir y devuelve totales por (período, dealer, tipo, concepto).
 */
@Injectable()
export class PayrollSnapshotJob implements JobHandler<PayrollSnapshotPayload> {
  readonly name = PAYROLL_SNAPSHOT_JOB
  readonly form: JobForm = {
    label: 'Payroll snapshot',
    fields: [
      { key: 'idContratista', type: 'company', label: 'Company' },
      { key: 'desde', type: 'dateFrom', label: 'From' },
      { key: 'hasta', type: 'dateTo', label: 'To' },
      { key: 'force', type: 'boolean', label: 'Force recalculation' },
    ],
  }

  constructor(
    private readonly source: PayrollSourceRepository,
    private readonly fingerprints: PayrollFingerprintRepository,
    private readonly writer: PayrollSnapshotWriter,
    private readonly states: PayrollPeriodStateService,
  ) {}

  async run(payload: PayrollSnapshotPayload, ctx: JobContext): Promise<JobResult> {
    const prorated = proratedDayId()
    if (prorated === null) {
      throw new Error('Falta TTK_PRORATED_DAY_ID: sin él las ponchadas Prorated Day se calcularían en $0')
    }
    for (const key of ['desde', 'hasta'] as const) {
      if (payload?.[key] !== undefined && !isYmd(payload[key])) {
        throw new BadRequestException(`payload.${key} tiene que ser YYYY-MM-DD`)
      }
    }

    const from = payrollSnapshotFrom()
    const corte = snapshotCutoff()
    const today = todayInZone(PAYROLL_TIME_ZONE)
    const ventana = addMonths(corte, -checkMonths())
    const recentLimit = addDays(today, -ALWAYS_RECALC_DAYS)
    const explicitRange = !!(payload?.desde || payload?.hasta)
    const rangeFrom = explicitRange ? maxDate(payload.desde ?? from, from) : maxDate(ventana, from)
    const rangeTo = minDate(payload?.hasta ?? corte, corte)

    const result = emptyJobResult()
    const skippedProviders: number[] = []
    const perProvider: Record<string, { periods: number; recalculated: number; rows: number; failed: number }> = {}
    const dryTotals: DryRunTotals = {}

    await ctx.log('info', 'parámetros', { from, corte, ventana, rangeFrom, rangeTo, calcVersion: CALC_VERSION })
    if (rangeFrom > rangeTo) {
      result.summary = { corte, rangeFrom, rangeTo, message: 'rango vacío' }
      return result
    }

    const idContratista = payload?.idContratista !== undefined ? Number(payload.idContratista) : null
    let providers: PayrollProviderConfig[]
    if (idContratista !== null) {
      const one = await this.source.getProvider(idContratista)
      if (!one) throw new BadRequestException(`La empresa ${idContratista} no existe`)
      providers = [one]
    } else {
      providers = await this.source.listProviders(from)
    }

    for (const provider of providers) {
      // payment_method NULL: TTK_DATE_GROUP_REPORT da error 1321. Se saltea (decisión E).
      if (provider.paymentMethod === null) {
        skippedProviders.push(provider.idContratista)
        await ctx.log('warn', `empresa ${provider.idContratista} salteada: sin payment_method`)
        continue
      }

      const periods = await this.source.getPeriods(provider, rangeFrom, rangeTo)
      const stats = { periods: periods.length, recalculated: 0, rows: 0, failed: 0 }
      perProvider[provider.idContratista] = stats
      if (!periods.length) continue

      const needsFingerprint = !ctx.force && !ctx.dryRun
      const fpSource: ProviderFingerprintSource | null = needsFingerprint
        ? await this.fingerprints.load(provider.idContratista, periods[0].desde, corte)
        : null
      const states = needsFingerprint ? await this.states.mapByProvider(provider.idContratista) : new Map()

      for (const periodo of periods) {
        result.itemsTotal++
        const fp = fpSource ? periodFingerprint(fpSource, periodo, corte, CALC_VERSION) : ''
        const state = states.get(periodo.desde)
        const recalc =
          ctx.force ||
          ctx.dryRun ||
          periodo.hasta >= recentLimit ||
          !state ||
          state.status !== 'ok' ||
          state.fingerprint !== fp ||
          state.calcVersion !== CALC_VERSION
        if (!recalc) {
          result.itemsSkipped++
          continue
        }

        const t0 = Date.now()
        try {
          const fechaCalculo = utcDateTime()
          const rows = await this.computePeriod(provider, periodo, corte, fechaCalculo, prorated)
          if (ctx.dryRun) {
            accumulate(dryTotals, rows)
            stats.recalculated++
            stats.rows += rows.length
            result.itemsChanged++
            continue
          }
          // La huella se toma de los datos de antes del cálculo: si algo cambia mientras tanto, la
          // corrida siguiente lo vuelve a calcular.
          const fpFinal = fp || periodFingerprint(
            await this.fingerprints.load(provider.idContratista, periodo.desde, corte),
            periodo,
            corte,
            CALC_VERSION,
          )
          const written = await this.writer.rewritePeriod(provider.idContratista, periodo.desde, rows)
          await this.states.save({
            idContratista: provider.idContratista,
            periodoDesde: periodo.desde,
            periodoHasta: periodo.hasta,
            paymentMethod: provider.paymentMethod,
            fingerprint: fpFinal,
            calcVersion: CALC_VERSION,
            lastCalculatedAt: fechaCalculo,
            idLastJobRun: ctx.runId,
            rowsWritten: written,
            status: 'ok',
            error: null,
          })
          stats.recalculated++
          stats.rows += written
          result.itemsChanged++
          await ctx.log('info', `empresa ${provider.idContratista} ${periodo.desde}..${periodo.hasta}: ${written} filas`, {
            ms: Date.now() - t0,
            motivo: recalcReason(ctx.force, periodo.hasta >= recentLimit, state, fp, CALC_VERSION),
          })
        } catch (e) {
          const message = (e as Error)?.message ?? String(e)
          stats.failed++
          result.itemsFailed++
          await ctx.log('error', `empresa ${provider.idContratista} ${periodo.desde}..${periodo.hasta}: ${message}`, {
            stack: (e as Error)?.stack,
          })
          if (!ctx.dryRun) {
            await this.states
              .save({
                idContratista: provider.idContratista,
                periodoDesde: periodo.desde,
                periodoHasta: periodo.hasta,
                paymentMethod: provider.paymentMethod,
                fingerprint: fp,
                calcVersion: CALC_VERSION,
                lastCalculatedAt: utcDateTime(),
                idLastJobRun: ctx.runId,
                rowsWritten: 0,
                status: 'failed',
                error: message.slice(0, 60_000),
              })
              .catch(() => undefined)
          }
        }
      }
    }

    result.summary = {
      corte,
      ventana,
      rangeFrom,
      rangeTo,
      calcVersion: CALC_VERSION,
      providers: perProvider,
      skippedProviders,
      ...(ctx.dryRun ? { totals: roundTotals(dryTotals) } : {}),
    }
    return result
  }

  /** Lee las filas fuente del período hasta el corte y las pasa por el calculator. */
  async computePeriod(
    provider: PayrollProviderConfig,
    periodo: PayrollPeriod,
    corte: string,
    fechaCalculo: string,
    prorated: number | null,
  ): Promise<SnapshotRow[]> {
    const last = minDate(periodo.hasta, corte)
    const [punchRows, pieceworkDayRows, salaryRows] = await Promise.all([
      this.source.getPunchRows(provider.idContratista, periodo.desde, last),
      this.source.getPieceworkDayRows(provider.idContratista, periodo.desde, last),
      this.source.getSalaryRows(provider.idContratista, periodo.desde),
    ])
    return calculatePeriod({
      provider,
      periodo,
      corte,
      punchRows,
      pieceworkDayRows,
      salaryRows,
      fechaCalculo,
      calcVersion: CALC_VERSION,
      proratedDayId: prorated,
    })
  }
}

function recalcReason(
  force: boolean,
  recent: boolean,
  state: { fingerprint: string; calcVersion: number; status: string } | undefined,
  fp: string,
  calcVersion: number,
): string {
  if (force) return 'force'
  if (!state) return 'sin estado'
  if (state.status !== 'ok') return 'falló antes'
  if (state.calcVersion !== calcVersion) return 'calc_version'
  if (state.fingerprint !== fp) return 'huella'
  if (recent) return 'últimos 30 días'
  return '-'
}

function accumulate(totals: DryRunTotals, rows: SnapshotRow[]): void {
  for (const r of rows) {
    const key = `${r.periodoDesde}|${r.idDealer ?? 'null'}|${r.idPaymentType}|${r.concepto}`
    const t = totals[key] ?? (totals[key] = { monto: 0, montoTax: 0, horas: 0, filas: 0 })
    t.monto += r.monto
    t.montoTax += r.montoTax
    t.horas += r.concepto === 'ponchada' ? r.horas : 0
    t.filas++
  }
}

function roundTotals(totals: DryRunTotals): DryRunTotals {
  const out: DryRunTotals = {}
  for (const key of Object.keys(totals)) {
    const t = totals[key]
    out[key] = { monto: round4(t.monto), montoTax: round4(t.montoTax), horas: round4(t.horas), filas: t.filas }
  }
  return out
}
