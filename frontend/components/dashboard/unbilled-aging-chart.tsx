'use client'

import { Loader2 } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n/locale-context'
import { UNBILLED_LOOKBACK_MONTHS, type UnbilledAgingBucket } from '@/lib/srs-kpis-api'

/** Orden y color fijos de los buckets que devuelve el backend. */
const BUCKET_ORDER = ['0-7 days', '8-14 days', '15-30 days', '31+ days'] as const
const BUCKET_COLOR: Record<string, string> = {
  '0-7 days': '#22c55e',
  '8-14 days': '#84cc16',
  '15-30 days': '#f59e0b',
  '31+ days': '#ef4444',
}

type UnbilledAgingChartProps = {
  data?: UnbilledAgingBucket[]
  loading?: boolean
}

export function UnbilledAgingChart({ data, loading }: UnbilledAgingChartProps) {
  const { t } = useTranslation()

  const chartData = [...(data ?? [])].sort(
    (a, b) => BUCKET_ORDER.indexOf(a.bucket as never) - BUCKET_ORDER.indexOf(b.bucket as never),
  )

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-base">{t('mockKpis.chartUnbilledAging')}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {t('mockKpis.unbilledLookbackNote', { months: UNBILLED_LOOKBACK_MONTHS })}
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-[280px] items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis type="number" fontSize={12} allowDecimals={false} />
              <YAxis type="category" dataKey="bucket" fontSize={12} width={80} />
              <Tooltip />
              <Legend />
              <Bar dataKey="wos" name={t('mockKpis.chartWos')} radius={[0, 4, 4, 0]}>
                {chartData.map((b) => (
                  <Cell key={b.bucket} fill={BUCKET_COLOR[b.bucket] ?? '#f59e0b'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
