'use client'

import { format, parseISO } from 'date-fns'
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
import { useTranslation } from '@/lib/i18n/locale-context'
import type { ProductionWeekPoint } from '@/lib/srs-kpis-api'

const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString()}`
const fmtMoneyK = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`)

type ProductionWeekChartProps = {
  data?: ProductionWeekPoint[]
  loading?: boolean
}

export function ProductionWeekChart({ data, loading }: ProductionWeekChartProps) {
  const { t } = useTranslation()

  const chartData = (data ?? []).map((row) => ({
    ...row,
    week: format(parseISO(row.weekStart), 'MMM d'),
  }))

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
              <XAxis dataKey="week" fontSize={12} tickMargin={8} />
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
