'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { CircleCheck, CirclePause, CircleX, Play, RefreshCw, TriangleAlert, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DataTable } from '@/components/shared/data-table/data-table'
import { DataTableColumnHeader } from '@/components/shared/data-table/data-table-column-header'
import { RunJobDialog } from '@/components/settings/run-job-dialog'
import { useTranslation, type TranslateFn } from '@/lib/i18n/locale-context'
import { cn } from '@/lib/utils'
import {
  fetchJobRunLog,
  fetchJobRuns,
  fetchJobs,
  fetchJobsHealth,
  formatJobDuration,
  formatJobTimeNy,
  runJob,
  type JobDailyStatus,
  type JobRun,
  type JobRunStatus,
} from '@/lib/jobs-api'

const ALL = '__all__'

function statusLabel(status: JobRunStatus, t: TranslateFn): string {
  if (status === 'ok') return t('systemConfig.jobsStatusOk')
  if (status === 'failed') return t('systemConfig.jobsStatusFailed')
  if (status === 'skipped') return t('systemConfig.jobsStatusSkipped')
  return t('systemConfig.jobsStatusRunning')
}

const STATUS_BADGE: Record<JobRunStatus, string> = {
  ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  failed: 'border-destructive/30 bg-destructive/10 text-destructive',
  skipped: 'border-border bg-muted text-muted-foreground',
  running: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
}

function StatusBadge({ status }: { status: JobRunStatus }) {
  const { t } = useTranslation()
  return (
    <Badge variant="outline" className={cn('font-medium', STATUS_BADGE[status])}>
      {statusLabel(status, t)}
    </Badge>
  )
}

/** Franja de la corrida diaria: verde / roja / ámbar / gris, con la misma regla que `/api/health/jobs`. */
function DailyStatusStrip({ status }: { status: JobDailyStatus }) {
  const { t } = useTranslation()
  const last = status.lastRun
  const when = last ? formatJobTimeNy(last.startedAt, false) : ''
  const duration = last ? formatJobDuration(last.durationMs) : ''
  const view = {
    ok: {
      icon: CircleCheck,
      cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100',
      title: t('systemConfig.jobsDailyOk'),
      meta: last ? t('systemConfig.jobsDailyOkMeta', { when, duration, count: last.itemsChanged }) : '',
    },
    failed: {
      icon: CircleX,
      cls: 'border-destructive/30 bg-destructive/10 text-destructive',
      title: t('systemConfig.jobsDailyFailed'),
      meta: last ? t('systemConfig.jobsDailyFailedMeta', { when, duration, error: last.error ?? '' }) : '',
    },
    missing: {
      icon: TriangleAlert,
      cls: 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100',
      title: t('systemConfig.jobsDailyMissing'),
      meta: last ? t('systemConfig.jobsDailyMissingMeta', { when }) : '',
    },
    disabled: {
      icon: CirclePause,
      cls: 'border-border bg-muted/50 text-foreground',
      title: t('systemConfig.jobsDailyDisabled'),
      meta: t('systemConfig.jobsDailyDisabledMeta'),
    },
  }[status.state]
  const Icon = view.icon
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-3 text-sm', view.cls)}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="font-semibold">{view.title}</span>
      {view.meta ? <span className="min-w-0 break-words text-xs opacity-80 tabular-nums">{view.meta}</span> : null}
    </div>
  )
}

/**
 * Monitor de ejecuciones del worker (System Config › Jobs). Solo Admin General: la página muestra
 * la tab únicamente si el backend responde 200 (a todo otro rol le da 403).
 */
export function JobsMonitor({ jobNames }: { jobNames?: string[] }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState(ALL)
  const [openRunId, setOpenRunId] = useState<number | null>(null)
  const [runOpen, setRunOpen] = useState(false)

  const jobs = useQuery({ queryKey: ['jobs', 'list'], queryFn: fetchJobs })
  const health = useQuery({ queryKey: ['jobs', 'health'], queryFn: fetchJobsHealth })
  const runs = useQuery({
    queryKey: ['jobs', 'runs', filter],
    queryFn: () => fetchJobRuns(filter === ALL ? '' : filter, 20),
    // Mientras haya una corrida en curso, la tabla se refresca sola.
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === 'running') ? 5000 : false),
  })
  const log = useQuery({
    queryKey: ['jobs', 'log', openRunId],
    queryFn: () => fetchJobRunLog(openRunId!),
    enabled: openRunId !== null,
  })

  const filterOptions = useMemo(
    () => [...new Set([...(jobs.data ?? []).map((j) => j.name), ...(jobNames ?? [])])],
    [jobs.data, jobNames],
  )

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['jobs'] })
  }

  const handleRun = (name: string, body: { payload: Record<string, unknown>; force: boolean }) => {
    setRunOpen(false)
    // La corrida es inline en el servidor y puede tardar minutos: la tabla la muestra «running»
    // apenas arranca y se refresca sola hasta que termina.
    const pending = runJob(name, body)
    window.setTimeout(refresh, 800)
    pending
      .then((r) => {
        if (r.status === 'failed') toast.error(`${name} #${r.runId}: ${r.error ?? 'failed'}`)
        else toast.success(`${name} #${r.runId}: ${r.status}`)
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : String(e)))
      .finally(refresh)
  }

  const columns = useMemo<ColumnDef<JobRun>[]>(
    () => [
      {
        accessorKey: 'jobName',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('systemConfig.jobsColJob')} />,
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.jobName}</span>,
        size: 150,
        minSize: 150,
        meta: { label: t('systemConfig.jobsColJob') },
      },
      {
        accessorKey: 'startedAt',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('systemConfig.jobsColStarted')} />,
        cell: ({ row }) => <span className="tabular-nums">{formatJobTimeNy(row.original.startedAt)}</span>,
        size: 190,
        meta: { label: t('systemConfig.jobsColStarted') },
      },
      {
        accessorKey: 'finishedAt',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('systemConfig.jobsColFinished')} />,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatJobTimeNy(row.original.finishedAt) || '—'}</span>
        ),
        size: 190,
        meta: { label: t('systemConfig.jobsColFinished') },
      },
      {
        accessorKey: 'durationMs',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('systemConfig.jobsColDuration')} />,
        cell: ({ row }) =>
          row.original.status === 'running' ? (
            <span className="text-muted-foreground">{statusLabel('running', t)}</span>
          ) : (
            <span className="font-semibold">{formatJobDuration(row.original.durationMs)}</span>
          ),
        size: 110,
        meta: { label: t('systemConfig.jobsColDuration'), numeric: true },
      },
      {
        accessorKey: 'trigger',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('systemConfig.jobsColTrigger')} />,
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.trigger}</span>,
        size: 100,
        meta: { label: t('systemConfig.jobsColTrigger') },
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('systemConfig.jobsColStatus')} />,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
        size: 110,
        meta: { label: t('systemConfig.jobsColStatus') },
      },
      ...(
        [
          ['itemsChanged', 'jobsColChanged'],
          ['itemsSkipped', 'jobsColSkipped'],
          ['itemsFailed', 'jobsColFailed'],
          ['itemsTotal', 'jobsColTotal'],
        ] as const
      ).map(
        ([key, label]): ColumnDef<JobRun> => ({
          accessorKey: key,
          header: ({ column }) => <DataTableColumnHeader column={column} title={t(`systemConfig.${label}`)} />,
          size: 100,
          meta: { label: t(`systemConfig.${label}`), numeric: true },
        }),
      ),
    ],
    [t],
  )

  const detail = log.data
  const dailyStatuses = health.data ?? []

  return (
    <div className="space-y-4">
      {dailyStatuses.map((s) => (
        <DailyStatusStrip key={s.jobName} status={s} />
      ))}

      <Card className="border-border">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg">{t('systemConfig.jobsRunsTitle')}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-full cursor-pointer sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('systemConfig.jobsAllJobs')}</SelectItem>
                {filterOptions.map((name) => (
                  <SelectItem key={name} value={name} className="font-mono">
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw />
              {t('systemConfig.jobsRefresh')}
            </Button>
            <Button size="sm" onClick={() => setRunOpen(true)} disabled={!(jobs.data ?? []).some((j) => j.runnable)}>
              <Play />
              {t('systemConfig.jobsRunJob')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable<JobRun, unknown>
            tableId="jobs-monitor-runs"
            columns={columns as ColumnDef<JobRun, unknown>[]}
            data={runs.data ?? []}
            isLoading={runs.isLoading}
            getRowId={(r) => String(r.id)}
            // Las demás columnas quedan con su ancho (la fecha y hora entera) y la tabla scrollea de
            // costado en pantalla angosta; sin esto se repartían en partes iguales y cortaban la hora.
            flexColumnId="jobName"
            onRowClick={(r) => setOpenRunId(r.id)}
            enableViewOptions={false}
            enableExport={false}
          />
        </CardContent>
      </Card>

      <Dialog open={openRunId !== null} onOpenChange={(o) => !o && setOpenRunId(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {t('systemConfig.jobsRunLabel')} #{openRunId}
              {detail ? <StatusBadge status={detail.run.status} /> : null}
            </DialogTitle>
          </DialogHeader>
          {detail ? (
            <div className="min-w-0 space-y-4">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">{t('systemConfig.jobsKeyJob')}</dt>
                <dd className="min-w-0 break-words font-mono text-xs">
                  {detail.run.jobName} · {detail.run.trigger}
                </dd>
                <dt className="text-muted-foreground">{t('systemConfig.jobsKeyWhen')}</dt>
                <dd className="min-w-0 tabular-nums">
                  {formatJobTimeNy(detail.run.startedAt)} → {formatJobTimeNy(detail.run.finishedAt) || '—'} (
                  {formatJobDuration(detail.run.durationMs) || '—'})
                </dd>
                <dt className="text-muted-foreground">{t('systemConfig.jobsKeyPayload')}</dt>
                <dd className="min-w-0 break-all font-mono text-xs">{detail.run.payload ?? '{}'}</dd>
                <dt className="text-muted-foreground">{t('systemConfig.jobsKeyHost')}</dt>
                <dd className="min-w-0 break-words">
                  {detail.run.host ?? '—'} · pid {detail.run.pid ?? '—'}
                </dd>
                {detail.run.error ? (
                  <>
                    <dt className="text-muted-foreground">{t('systemConfig.jobsKeyError')}</dt>
                    <dd className="min-w-0 break-words text-destructive">{detail.run.error}</dd>
                  </>
                ) : null}
              </dl>
              <div className="max-h-[50vh] overflow-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[110px]">{t('systemConfig.jobsLogTime')}</TableHead>
                      <TableHead className="w-[70px]">{t('systemConfig.jobsLogLevel')}</TableHead>
                      <TableHead>{t('systemConfig.jobsLogMessage')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.lines.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {new Date(l.ts * 1000).toLocaleTimeString('en-US', {
                            timeZone: 'America/New_York',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: true,
                          })}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'font-medium',
                            l.level === 'error' && 'text-destructive',
                            l.level === 'warn' && 'text-amber-700 dark:text-amber-400',
                          )}
                        >
                          {l.level}
                        </TableCell>
                        <TableCell className="whitespace-normal break-words">{l.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenRunId(null)}>
              <X />
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RunJobDialog open={runOpen} onOpenChange={setRunOpen} jobs={jobs.data ?? []} onRun={handleRun} />
    </div>
  )
}
