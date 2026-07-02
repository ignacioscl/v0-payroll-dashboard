'use client'

import { useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useFilters } from '@/lib/filter-context'
import { useTranslation } from '@/lib/i18n/locale-context'
import { formatWeekBucketLabel } from '@/lib/kpi/week-bucket-label'
import type { ProductionWeekPoint } from '@/lib/srs-kpis-api'
import { formatDateParam } from '@/lib/ttk/map-header-filters'

const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString()}`
const fmtMoneyK = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`)

type ProductionWeekChartProps = {
  data?: ProductionWeekPoint[]
  loading?: boolean
}

export function ProductionWeekChart({ data, loading }: ProductionWeekChartProps) {
  const { t } = useTranslation()
  const { dateRange } = useFilters()

  const fechaHasta = useMemo(
    () => formatDateParam(dateRange?.to ?? dateRange?.from),
    [dateRange],
  )

  const chartData = useMemo(
    () =>
      (data ?? []).map((row) => ({
        ...row,
        week: formatWeekBucketLabel(row.weekStart, fechaHasta || undefined),
      })),
    [data, fechaHasta],
  )

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-base">{t('mockKpis.chartCompletedWosProduction')}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-[280px] items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis
                dataKey="week"
                fontSize={11}
                tickMargin={8}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={56}
              />
              <YAxis yAxisId="left" fontSize={12} allowDecimals={false} />
              <YAxis
                yAxisId="right"
                orientation="right"
                fontSize={12}
                tickFormatter={(v) => fmtMoneyK(Number(v))}
              />
              <Tooltip
                formatter={(value: number, name: string) =>
                  name === t('mockKpis.chartProductionDollar') ? fmtMoney(value) : value.toLocaleString()
                }
              />
              <Legend />
              <Bar
                yAxisId="left"
                dataKey="woCompleted"
                name={t('mockKpis.chartWosDone')}
                fill="#3b82f6"
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId="right"
                dataKey="productionValue"
                name={t('mockKpis.chartProductionDollar')}
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
