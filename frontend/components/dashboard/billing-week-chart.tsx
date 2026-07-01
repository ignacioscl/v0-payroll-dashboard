'use client'

import { format, parseISO } from 'date-fns'
import { Loader2 } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n/locale-context'
import type { BillingWeekPoint } from '@/lib/srs-kpis-api'

const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString()}`
const fmtMoneyK = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`)

type BillingWeekChartProps = {
  data?: BillingWeekPoint[]
  loading?: boolean
}

export function BillingWeekChart({ data, loading }: BillingWeekChartProps) {
  const { t } = useTranslation()

  const chartData = (data ?? []).map((row) => ({
    ...row,
    week: format(parseISO(row.weekStart), 'MMM d'),
  }))

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-base">{t('mockKpis.chartInvoicedByWeek')}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-[280px] items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="week" fontSize={12} tickMargin={8} />
              <YAxis fontSize={12} tickFormatter={(v) => fmtMoneyK(Number(v))} />
              <Tooltip formatter={(value: number) => fmtMoney(value)} />
              <Legend />
              <Bar
                dataKey="invoicedValue"
                name={t('mockKpis.chartInvoicedDollar')}
                fill="#3b82f6"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
