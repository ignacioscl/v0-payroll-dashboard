import { Injectable } from '@nestjs/common'

import { emptyJobResult, JobContext, JobHandler, JobResult } from './job.interface'

/**
 * Job de prueba de la infraestructura: espera 1 s, loguea el payload y no toca nada.
 * `{"fail":true}` lo hace fallar a propósito, para provocar una alerta de prueba por CLI
 * (plans/plan-nest-email §9) sin tocar datos ni la ventana horaria de payroll-snapshot.
 */
@Injectable()
export class NoopJob implements JobHandler<Record<string, unknown>> {
  readonly name = 'noop'

  async run(payload: Record<string, unknown>, ctx: JobContext): Promise<JobResult> {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    if (payload?.fail === true) throw new Error('noop: fallo a propósito')
    await ctx.log('info', 'noop', { payload })
    return emptyJobResult()
  }
}
