'use client'

import { Loader2 } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTranslation, type TranslateFn } from '@/lib/i18n/locale-context'
import type { PayrollSpendKpi, PayrollSpendTypeRow } from '@/lib/srs-kpis-api'

const BAR_COLOR = '#f43f5e'
const TAX_COLOR = '#64748b'
const ROW_HEIGHT = 46

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num2 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type ChartRow = { key: string; label: string; qty: string; amount: number; color: string }

function typeLabel(row: PayrollSpendTypeRow, t: TranslateFn): string {
  if (row.kind === 'overtime_auto') return t('businessKpis.payrollTypeOvertimeAuto')
  if (row.kind === 'overtime_manual') return t('businessKpis.payrollTypeOvertimeManual')
  return row.name
}

function qtyLabel(row: PayrollSpendTypeRow): string {
  if (row.measure === 'hours') return `${num2(row.hours)} h`
  if (row.measure === 'none') return '—'
  return row.qty.toLocaleString('en-US')
}

type PayrollByTypeChartProps = {
  data?: PayrollSpendKpi
  loading?: boolean
  /** Rango del header ya formateado (MM/DD/YYYY – MM/DD/YYYY). */
  rangeLabel: string | null
  dealerCount: number
}

/**
 * Desglose de Total Payroll por tipo de pago, siempre visible debajo de las tarjetas (Ignacio,
 * 03/10/2026: reemplaza al diálogo). Una barra por tipo con su monto; debajo del nombre, la cantidad
 * u horas. La fila «Total» da exacto el número de la tarjeta.
 */
export function PayrollByTypeChart({ data, loading, rangeLabel, dealerCount }: PayrollByTypeChartProps) {
  const { t } = useTranslation()

  const rows: ChartRow[] = (data?.byType ?? []).map((r) => ({
    key: `${r.id}|${r.concepto}`,
    label: typeLabel(r, t),
    qty: qtyLabel(r),
    amount: r.amount,
    color: BAR_COLOR,
  }))
  if (data && data.payrollTaxes !== 0) {
    rows.push({ key: 'taxes', label: t('businessKpis.payrollTaxesRow'), qty: '—', amount: data.payrollTaxes, color: TAX_COLOR })
  }
  const byKey = new Map(rows.map((r) => [r.key, r]))

  return (
    <Card className="bg-card border-border">
      <CardHeader className="gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <CardTitle className="text-base">{t('businessKpis.payrollChartTitle')}</CardTitle>
          {data ? (
            <p className="text-sm font-semibold tabular-nums">
              {t('businessKpis.payrollTotalRow')} {money(data.totalPayroll)}
            </p>
          ) : null}
        </div>
        {rangeLabel ? (
          <p className="text-xs text-muted-foreground tabular-nums">
            {t('businessKpis.payrollChartSubtitle', { range: rangeLabel, count: dealerCount })}
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-[280px] items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('common.noDataToDisplay')}</p>
        ) : (
          <ResponsiveContainer width="100%" height={rows.length * ROW_HEIGHT + 16}>
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 96, bottom: 0, left: 0 }} barCategoryGap={8}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" className="opacity-30" />
              <XAxis type="number" hide domain={[0, 'dataMax']} />
              <YAxis
                type="category"
                dataKey="key"
                width={128}
                tickLine={false}
                axisLine={false}
                interval={0}
                tick={(props: { x: number; y: number; payload: { value: string } }) => {
                  const row = byKey.get(props.payload.value)
                  if (!row) return <g />
                  return (
                    <g transform={`translate(${props.x},${props.y})`}>
                      <text x={-6} y={-3} textAnchor="end" className="fill-foreground" fontSize={12}>
                        {row.label}
                      </text>
                      <text x={-6} y={12} textAnchor="end" className="fill-muted-foreground tabular-nums" fontSize={11}>
                        {row.qty}
                      </text>
                    </g>
                  )
                }}
              />
              <Tooltip
                cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                content={({ active, payload }) => {
                  const row = active ? (payload?.[0]?.payload as ChartRow | undefined) : undefined
                  if (!row) return null
                  return (
                    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                      <p className="mb-1 font-semibold text-foreground">{row.label}</p>
                      <p className="flex justify-between gap-4 text-muted-foreground">
                        <span>{t('businessKpis.payrollColQty')}</span>
                        <span className="tabular-nums text-foreground">{row.qty}</span>
                      </p>
                      <p className="flex justify-between gap-4 text-muted-foreground">
                        <span>{t('businessKpis.payrollColAmount')}</span>
                        <span className="tabular-nums text-foreground">{money(row.amount)}</span>
                      </p>
                    </div>
                  )
                }}
              />
              <Bar dataKey="amount" radius={[0, 4, 4, 0]} maxBarSize={26} minPointSize={2}>
                {rows.map((r) => (
                  <Cell key={r.key} fill={r.color} />
                ))}
                <LabelList
                  dataKey="amount"
                  position="right"
                  className="fill-foreground tabular-nums"
                  fontSize={12}
                  formatter={(v: number) => money(v)}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
