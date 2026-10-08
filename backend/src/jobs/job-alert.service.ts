import { Injectable, Logger } from '@nestjs/common'

import { EmailService } from '../commons/email/email.service'
import { JobRun } from '../features/job-run/entity/job-run.jobsentity'
import { JobRunService, utcNow } from '../features/job-run/service/job-run.service'
import { JobRunLogService } from '../features/job-run-log/service/job-run-log.service'
import { areJobAlertsEnabled } from './jobs-env'

const ONE_HOUR_MS = 3_600_000

/**
 * Alertas por email de los jobs, en texto plano por el módulo de email (plans/plan-nest-email §9).
 * Asunto y cuerpo son internos (los lee Juan / Ignacio), nunca van a un cliente.
 *
 * Dos compuertas: los jobs deciden si *piden* la alerta (`areJobAlertsEnabled()`: en dev solo con
 * `JOBS_DEV_FORCE=true`; si no, queda «alert suppressed in development» en el log) y el módulo de
 * email decide si *sale* (en dev solo con `EMAIL_DEV_REDIRECT_TO`, y a esa casilla). `alert_sent_at`
 * se marca solo si salió de verdad (`status: 'sent'`).
 */
@Injectable()
export class JobAlertService {
  private readonly logger = new Logger('Jobs')

  constructor(
    private readonly email: EmailService,
    private readonly runs: JobRunService,
    private readonly logs: JobRunLogService,
  ) {}

  /** Una corrida terminó `failed`: una alerta por hora por job como máximo. */
  async onFailed(run: JobRun): Promise<void> {
    if (!areJobAlertsEnabled()) {
      await this.logs.append(run.id!, 'warn', 'alert suppressed in development')
      return
    }
    if (await this.runs.alertSentSince(run.jobName, utcNow(new Date(Date.now() - ONE_HOUR_MS)))) {
      await this.logs.append(run.id!, 'info', 'alerta no enviada: ya se mandó una en la última hora')
      return
    }
    const sent = await this.send(
      `[SRS jobs] ${run.jobName} failed`,
      [
        `Job: ${run.jobName}`,
        `Run: ${run.id} (${run.trigger}) on ${run.host ?? '?'}`,
        `Started (UTC): ${run.startedAt}`,
        `Error: ${run.error ?? '-'}`,
        `Failed units: ${run.itemsFailed}`,
        '',
        `Runs: ${this.runsLink(run.jobName)}`,
      ].join('\n'),
      run.id!,
    )
    if (sent) await this.runs.markAlertSent(run)
  }

  /** Aviso del watchdog: no hubo corrida diaria ok en la ventana esperada. */
  async onWatchdog(watchdogRun: JobRun, jobName: string, reason: string): Promise<void> {
    if (!areJobAlertsEnabled()) {
      await this.logs.append(watchdogRun.id!, 'warn', 'alert suppressed in development', { jobName, reason })
      return
    }
    const sent = await this.send(
      `[SRS jobs] ${jobName}: no successful daily run`,
      [`Job: ${jobName}`, `Watchdog: ${reason}`, '', `Runs: ${this.runsLink(jobName)}`].join('\n'),
      watchdogRun.id!,
    )
    if (sent) await this.runs.markAlertSent(watchdogRun)
  }

  private async send(subject: string, text: string, runId: number): Promise<boolean> {
    const to = process.env.JOBS_ALERT_EMAIL?.trim()
    if (!to) {
      await this.logs.append(runId, 'warn', 'alerta no enviada: falta JOBS_ALERT_EMAIL')
      return false
    }
    const result = await this.email.send({ purpose: 'job-alert', audience: 'internal', to, subject, text })
    const sent = result.status === 'sent'
    const detail =
      result.status === 'sent'
        ? `alerta enviada a ${to}${result.mode === 'redirect' ? ` (redirigida a ${result.to.join(', ')})` : ''}`
        : result.status === 'suppressed'
        ? `alerta suprimida (email ${result.mode}: ${result.reason})`
        : `no se pudo enviar la alerta: ${result.error}`
    await this.logs.append(runId, sent ? 'info' : 'warn', detail)
    if (!sent) this.logger.warn(`[run ${runId}] ${detail}`)
    return sent
  }

  private runsLink(jobName: string): string {
    const base = (process.env.API_ENDPOINT ?? '').replace(/\/+$/, '')
    return `${base}/api/jobs/runs?name=${encodeURIComponent(jobName)}`
  }
}
