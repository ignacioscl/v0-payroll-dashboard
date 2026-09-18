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
import { fmtDollars, shownPending, sumShown } from '@/lib/kpi-money'

const fmtMoneyK = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`)

const PRODUCED_STACK = [
  { key: 'woInvoicedValue' as const, color: 'var(--chart-1)', nameKey: 'businessKpis.seriesWoInvoiced' },
  { key: 'ttkInvoicedValue' as const, color: 'var(--chart-2)', nameKey: 'businessKpis.seriesTtkInvoiced' },
  { key: 'genericInvoicedValue' as const, color: 'var(--chart-3)', nameKey: 'businessKpis.seriesGenerics' },
  { key: 'woUnbilledValue' as const, color: 'var(--chart-4)', nameKey: 'businessKpis.seriesWoUnbilled' },
]
const COLLECTED_COLOR = '#22c55e'

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
    produced: string
    woInvoiced: string
    ttkInvoiced: string
    generics: string
    woUnbilled: string
    collected: string
    pending: string
    notInvoiced: string
    rate: string
  }
}) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  const produced = sumShown(
    row.woInvoicedValue,
    row.ttkInvoicedValue,
    row.genericInvoicedValue,
    row.woUnbilledValue,
  )
  const pending = shownPending(row)

  return (
    <div className="rounded-lg border border-border/80 bg-popover px-3 py-2 text-sm shadow-md">
      <p className="mb-1.5 font-semibold tabular-nums">{row.month}</p>
      <p>
        {labels.produced}: {fmtDollars(produced)}
      </p>
      <p className="pl-3 text-muted-foreground">
        {labels.woInvoiced}: {fmtDollars(row.woInvoicedValue)}
      </p>
      <p className="pl-3 text-muted-foreground">
        {labels.ttkInvoiced}: {fmtDollars(row.ttkInvoicedValue)}
      </p>
      <p className="pl-3 text-muted-foreground">
        {labels.generics}: {fmtDollars(row.genericInvoicedValue)}
      </p>
      <p className="pl-3 text-muted-foreground">
        {labels.woUnbilled}: {fmtDollars(row.woUnbilledValue)}
      </p>
      <p>
        {labels.collected}: {fmtDollars(row.collectedValue)}
      </p>
      <p>
        {labels.pending}: {fmtDollars(pending)}
      </p>
      <p>
        {labels.notInvoiced}: {fmtDollars(row.woUnbilledValue)}
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
      produced: t('businessKpis.tooltipProduced'),
      woInvoiced: t('businessKpis.seriesWoInvoiced'),
      ttkInvoiced: t('businessKpis.seriesTtkInvoiced'),
      generics: t('businessKpis.seriesGenerics'),
      woUnbilled: t('businessKpis.seriesWoUnbilled'),
      collected: t('businessKpis.seriesCollected'),
      pending: t('businessKpis.tooltipPendingCollection'),
      notInvoiced: t('businessKpis.tooltipNotInvoiced'),
      rate: t('businessKpis.tooltipPctCollected'),
    }),
    [t],
  )

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{t('businessKpis.producedVsCollectedByMonth')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('businessKpis.collectionsByMonthNote')}</p>
        </div>
        <Popover>
          <PopoverTrigger
            type="button"
            className="mt-0.5 shrink-0 cursor-pointer rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
              {PRODUCED_STACK.map((series, index) => (
                <Bar
                  key={series.key}
                  dataKey={series.key}
                  name={t(series.nameKey)}
                  fill={series.color}
                  stackId="produced"
                  radius={index === PRODUCED_STACK.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
              <Bar
                dataKey="collectedValue"
                name={t('businessKpis.seriesCollected')}
                fill={COLLECTED_COLOR}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
