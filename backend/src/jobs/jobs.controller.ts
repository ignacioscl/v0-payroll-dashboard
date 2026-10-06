import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'

import { SrsJwtGuard } from '../srs/auth/srs-jwt.guard'
import { SrsContext } from '../srs/auth/srs-auth-context.service'
import { SRS_ROL_ADMIN_GENERAL } from '../srs/shared/kpi/srs-kpi-dealer-filter'
import { JobRunQueryDto, JobRunRequestDto } from '../features/job-run/dto/job-run.dto'
import { JobRunService } from '../features/job-run/service/job-run.service'
import { JobRunLogService } from '../features/job-run-log/service/job-run-log.service'
import { JobRegistryService } from './job-registry.service'
import { JobRunnerService, JobRunOutcome } from './job-runner.service'
import { ContratistaService } from '../features/srs-contratista/service/contratista.service'
import { isJobsProd } from './jobs-env'
import { CRITICAL_DAILY_JOBS, dailyRunStatus } from './watchdog.job'

function assertAdminGeneral(ctx: SrsContext | undefined): void {
  if (!ctx || ctx.idRol !== SRS_ROL_ADMIN_GENERAL) throw new ForbiddenException('Forbidden')
}

/**
 * Disparo manual, corridas y monitor (System Config › Jobs). Solo Admin General (operación):
 * ningún usuario de una empresa, ni el Admin Company, corre jobs ni ve corridas. La corrida es
 * inline (`trigger = 'api'`).
 *
 * Responde en `/api/jobs` (curl, plan §8) y en `/api/srs/jobs` (la pantalla de v0 llega al Nest por
 * el proxy `/api/srs-kpis/*`, que solo reenvía a `/api/srs/*`).
 */
@UseGuards(SrsJwtGuard)
@Controller(['/jobs', '/srs/jobs'])
@ApiTags('Jobs')
@ApiBearerAuth()
export class JobsController {
  constructor(
    private readonly runner: JobRunnerService,
    private readonly runs: JobRunService,
    private readonly logs: JobRunLogService,
    private readonly registry: JobRegistryService,
    private readonly contratistas: ContratistaService,
  ) {}

  /** Jobs registrados con sus campos para «Run job». `noop` no se lista en producción. */
  @Get('/')
  listJobs(@Req() request: any) {
    assertAdminGeneral(request.srsContext)
    return this.registry
      .all()
      .filter((h) => !(isJobsProd() && h.name === 'noop'))
      .map((h) => ({
        name: h.name,
        label: h.form?.label ?? h.name,
        runnable: Boolean(h.form),
        fields: h.form?.fields ?? [],
      }))
  }

  /** Estado de la corrida diaria de cada job crítico (la franja de arriba del monitor). */
  @Get('/health')
  async health(@Req() request: any) {
    assertAdminGeneral(request.srsContext)
    const out = []
    for (const name of CRITICAL_DAILY_JOBS) {
      const s = await dailyRunStatus(this.runs, name)
      out.push({ jobName: name, state: s.state, reason: s.reason, lastRun: s.lastRun })
    }
    return out
  }

  /** Empresas para el campo «Company». */
  @Get('/companies')
  async listCompanies(@Req() request: any) {
    assertAdminGeneral(request.srsContext)
    const rows = await this.contratistas.findProvidersWithActiveDealers()
    return rows.map((c) => ({ id: c.id, name: (c.razonSocial ?? '').trim() }))
  }

  @Get('/runs')
  async listRuns(@Req() request: any, @Query() query: JobRunQueryDto) {
    assertAdminGeneral(request.srsContext)
    return this.runs.listRuns(query.name || undefined, query.limit ?? 20)
  }

  /** Detalle de una corrida y sus líneas de `JOB_RUN_LOG`. */
  @Get('/runs/:id/log')
  async runLog(@Req() request: any, @Param('id', ParseIntPipe) id: number) {
    assertAdminGeneral(request.srsContext)
    const run = await this.runs.findById(id)
    if (!run) throw new NotFoundException(`Run ${id} not found`)
    return { run, lines: await this.logs.listByRun(id) }
  }

  @Post('/:name/run')
  async run(
    @Req() request: any,
    @Param('name') name: string,
    @Body() body: JobRunRequestDto,
  ): Promise<JobRunOutcome> {
    assertAdminGeneral(request.srsContext)
    return this.runner.run(name, body?.payload ?? {}, 'api', { dryRun: body?.dryRun, force: body?.force })
  }
}
