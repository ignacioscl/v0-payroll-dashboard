import { Injectable, Logger } from '@nestjs/common'

import { EmailService } from '../commons/email/service/email.service'
import { JobRun } from '../features/job-run/entity/job-run.jobsentity'
import { JobRunService, utcNow } from '../features/job-run/service/job-run.service'
import { JobRunLogService } from '../features/job-run-log/service/job-run-log.service'
import { areJobAlertsEnabled } from './jobs-env'

const ONE_HOUR_MS = 3_600_000

/**
 * Alertas por email de los jobs. Asunto y cuerpo son internos (los lee Ignacio), nunca van a un
 * cliente. Fuera de producción no sale nada: la alerta queda como línea `warn` en el log.
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
    const ok = await this.email.sendEmail({ to, subject, text, html: `<pre>${escapeHtml(text)}</pre>` })
    await this.logs.append(runId, ok ? 'info' : 'warn', ok ? `alerta enviada a ${to}` : 'no se pudo enviar la alerta')
    if (!ok) this.logger.warn(`[run ${runId}] no se pudo enviar la alerta a ${to}`)
    return ok
  }

  private runsLink(jobName: string): string {
    const base = (process.env.API_ENDPOINT ?? '').replace(/\/+$/, '')
    return `${base}/api/jobs/runs?name=${encodeURIComponent(jobName)}`
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
