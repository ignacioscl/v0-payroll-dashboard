import { Injectable } from '@nestjs/common'

import { emptyJobResult, JobContext, JobHandler, JobResult } from './job.interface'

/** Job de prueba de la infraestructura: espera 1 s, loguea el payload y no toca nada. */
@Injectable()
export class NoopJob implements JobHandler<Record<string, unknown>> {
  readonly name = 'noop'

  async run(payload: Record<string, unknown>, ctx: JobContext): Promise<JobResult> {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    await ctx.log('info', 'noop', { payload })
    return emptyJobResult()
  }
}
