'use client'

import { useMemo } from 'react'
import { HelpCircle, Loader2 } from 'lucide-react'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTranslation } from '@/lib/i18n/locale-context'
import { formatMonthBucketLabel } from '@/lib/kpi/month-bucket-label'
import type { CollectionsByMonthPoint } from '@/lib/srs-kpis-api'

const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString()}`
const fmtMoneyK = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`)

type InvoiceCollectionMonthChartProps = {
  data?: CollectionsByMonthPoint[]
  loading?: boolean
}

type ChartRow = CollectionsByMonthPoint & { month: string }

function CollectionMonthTooltip({
  active,
  payload,
  labels,
}: {
  active?: boolean
  payload?: { payload: ChartRow }[]
  labels: {
    invoiced: string
    collected: string
    issued: string
    collectedCount: string
    rate: string
    outstanding: string
  }
}) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  const outstandingValue = Math.max(0, row.invoicedValue - row.collectedValue)
  const outstandingCount = Math.max(0, row.statementsIssued - row.collectedStatements)

  return (
    <div className="rounded-lg border border-border/80 bg-popover px-3 py-2 text-sm shadow-md">
      <p className="mb-1.5 font-semibold tabular-nums">{row.month}</p>
      <p>
        {labels.invoiced}: {fmtMoney(row.invoicedValue)}{' '}
        <span className="text-muted-foreground">
          ({row.statementsIssued} {labels.issued})
        </span>
      </p>
      <p>
        {labels.collected}: {fmtMoney(row.collectedValue)}{' '}
        <span className="text-muted-foreground">
          ({row.collectedStatements} {labels.collectedCount})
        </span>
      </p>
      <p className="text-muted-foreground">
        {labels.outstanding}: {fmtMoney(outstandingValue)} ({outstandingCount})
      </p>
      <p className="mt-1 font-medium tabular-nums">
        {labels.rate}: {row.collectionRatePct}%
      </p>
    </div>
  )
}

export function InvoiceCollectionMonthChart({ data, loading }: InvoiceCollectionMonthChartProps) {
  const { t, locale } = useTranslation()

  const chartData = useMemo<ChartRow[]>(
    () =>
      (data ?? []).map((row) => ({
        ...row,
        month: formatMonthBucketLabel(row.monthStart, locale),
      })),
    [data, locale],
  )

  const tooltipLabels = useMemo(
    () => ({
      invoiced: t('mockKpis.chartInvoicedDollar'),
      collected: t('mockKpis.chartCollectedDollar'),
      issued: t('mockKpis.chartStatementsIssued'),
      collectedCount: t('mockKpis.chartStatementsCollected'),
      rate: t('mockKpis.collectionRate'),
      outstanding: t('mockKpis.chartOutstandingDollar'),
    }),
    [t],
  )

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{t('mockKpis.chartInvoicedVsCollectedByMonth')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('businessKpis.collectionsByMonthNote')}</p>
        </div>
        <Popover>
          <PopoverTrigger
            type="button"
            className="mt-0.5 shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={t('common.kpiHelpAria')}
          >
            <HelpCircle className="h-4 w-4" />
          </PopoverTrigger>
          <PopoverContent align="end" className="max-w-sm text-sm">
            {t('businessKpisHelp.collectionsByMonth')}
          </PopoverContent>
        </Popover>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis
                dataKey="month"
                fontSize={11}
                tickMargin={8}
                interval={0}
                angle={chartData.length > 6 ? -25 : 0}
                textAnchor={chartData.length > 6 ? 'end' : 'middle'}
                height={chartData.length > 6 ? 56 : 32}
              />
              <YAxis fontSize={12} tickFormatter={(v) => fmtMoneyK(Number(v))} />
              <Tooltip content={<CollectionMonthTooltip labels={tooltipLabels} />} />
              <Legend />
              <Bar
                dataKey="invoicedValue"
                name={t('mockKpis.chartInvoicedDollar')}
                fill="#3b82f6"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="collectedValue"
                name={t('mockKpis.chartCollectedDollar')}
                fill="#22c55e"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
