'use client'

import { useCallback, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { srsProxyUrl } from '@/lib/srs-proxy-url'
import { UrlEnum } from '@/types/enum-url'

const REQUEST_COUNT = 10

type TargetKey = 'bff-dealers' | 'srs-proxy-dealers' | 'session'

const TARGETS: { key: TargetKey; label: string; url: string }[] = [
  { key: 'bff-dealers', label: 'BFF /api/dealers', url: UrlEnum.DEALERS },
  {
    key: 'srs-proxy-dealers',
    label: 'Proxy /api/srs → payroll/dealers.php',
    url: srsProxyUrl('php/api/payroll/dealers.php'),
  },
  { key: 'session', label: 'BFF /api/auth/session (sin PHP)', url: UrlEnum.AUTH_SESSION },
]

type RequestRow = {
  index: number
  startedAtMs: number
  endedAtMs: number
  durationMs: number
  status: number
  ok: boolean
}

type RunResult = {
  mode: 'parallel' | 'serial'
  target: TargetKey
  url: string
  batchStartedAt: number
  batchEndedAt: number
  rows: RequestRow[]
}

function formatMs(ms: number) {
  return `${ms.toFixed(0)} ms`
}

function inferConcurrency(rows: RequestRow[], batchDurationMs: number): string {
  if (rows.length === 0) return '—'
  const maxDuration = Math.max(...rows.map((r) => r.durationMs))
  const sumDuration = rows.reduce((s, r) => s + r.durationMs, 0)
  const overlap =
    batchDurationMs < sumDuration * 0.75 && batchDurationMs <= maxDuration * 1.4
  if (overlap) {
    return `Paralelo (batch ≈ max request: ${formatMs(maxDuration)} vs suma ${formatMs(sumDuration)})`
  }
  return `Serial / cola (batch ≈ suma: ${formatMs(batchDurationMs)} vs max ${formatMs(maxDuration)})`
}

async function fetchOne(url: string, index: number, originMs: number): Promise<RequestRow> {
  const startedAtMs = performance.now() - originMs
  const t0 = performance.now()
  const res = await fetch(url, { credentials: 'include', cache: 'no-store' })
  await res.text()
  const t1 = performance.now()
  return {
    index: index + 1,
    startedAtMs,
    endedAtMs: t1 - originMs,
    durationMs: t1 - t0,
    status: res.status,
    ok: res.ok,
  }
}

export function ParallelRequestTest() {
  const [target, setTarget] = useState<TargetKey>('bff-dealers')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)

  const selected = useMemo(
    () => TARGETS.find((t) => t.key === target) ?? TARGETS[0],
    [target],
  )

  const run = useCallback(
    async (mode: 'parallel' | 'serial') => {
      setRunning(true)
      setResult(null)
      const url = selected.url
      const origin = performance.now()
      const batchStartedAt = 0

      try {
        let rows: RequestRow[]

        if (mode === 'parallel') {
          rows = await Promise.all(
            Array.from({ length: REQUEST_COUNT }, (_, i) => fetchOne(url, i, origin)),
          )
        } else {
          rows = []
          for (let i = 0; i < REQUEST_COUNT; i++) {
            rows.push(await fetchOne(url, i, origin))
          }
        }

        const batchEndedAt = performance.now() - origin
        setResult({
          mode,
          target,
          url,
          batchStartedAt,
          batchEndedAt,
          rows,
        })
      } finally {
        setRunning(false)
      }
    },
    [selected.url, target],
  )

  const batchDuration = result ? result.batchEndedAt - result.batchStartedAt : 0
  const verdict = result ? inferConcurrency(result.rows, batchDuration) : null

  return (
    <div className="space-y-4">
      <p className="text-sm text-amber-600 dark:text-amber-500">
        Prueba temporal — borrar cuando terminen de medir paralelismo vs PHP session lock.
      </p>

      <div className="flex flex-wrap gap-2">
        {TARGETS.map((t) => (
          <Button
            key={t.key}
            type="button"
            size="sm"
            variant={target === t.key ? 'default' : 'outline'}
            disabled={running}
            onClick={() => setTarget(t.key)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <p className="font-mono text-xs text-muted-foreground break-all">{selected.url}</p>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={running}
          onClick={() => void run('parallel')}
        >
          {running ? 'Ejecutando…' : `Disparar ${REQUEST_COUNT} en paralelo`}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={running}
          onClick={() => void run('serial')}
        >
          {running ? '…' : `Disparar ${REQUEST_COUNT} en serie (control)`}
        </Button>
      </div>

      {result && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{result.mode}</Badge>
            <span>
              Batch total: <strong>{formatMs(batchDuration)}</strong>
            </span>
            <span className="text-muted-foreground">|</span>
            <span className={verdict?.startsWith('Paralelo') ? 'text-green-600' : 'text-orange-600'}>
              {verdict}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse font-mono text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1 pr-3">#</th>
                  <th className="py-1 pr-3">Inicio (+ms)</th>
                  <th className="py-1 pr-3">Fin (+ms)</th>
                  <th className="py-1 pr-3">Duración</th>
                  <th className="py-1">HTTP</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.index} className="border-b border-border/50">
                    <td className="py-1 pr-3">{row.index}</td>
                    <td className="py-1 pr-3">{formatMs(row.startedAtMs)}</td>
                    <td className="py-1 pr-3">{formatMs(row.endedAtMs)}</td>
                    <td className="py-1 pr-3">{formatMs(row.durationMs)}</td>
                    <td className={`py-1 ${row.ok ? '' : 'text-destructive'}`}>
                      {row.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            Paralelo: los &quot;Inicio&quot; deberían ser casi iguales y el batch total ≈ el request más
            lento. Serial (control): cada inicio ≈ fin del anterior y el batch ≈ suma de duraciones.
            Abrí DevTools → Network para comparar con la UI PHP clásica.
          </p>
        </div>
      )}
    </div>
  )
}
