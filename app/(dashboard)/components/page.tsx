'use client'

import { useEffect, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { BASE_DATE } from '@/lib/mock-data'
import { dealerOptions } from '@/lib/dealers'
import { DateRangePicker } from '@/components/filters/date-range-picker'
import { DealerSelect } from '@/components/filters/dealer-select'
import { DealerMultiSelect } from '@/components/filters/dealer-multi-select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

function defaultDateRange(): DateRange {
  const to = BASE_DATE
  const from = new Date(BASE_DATE)
  from.setDate(from.getDate() - 7)
  return { from, to }
}

export default function ComponentsPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [dealer, setDealer] = useState('all')
  const [dealers, setDealers] = useState<string[]>([])

  useEffect(() => {
    setDateRange(defaultDateRange())
    setDealers(dealerOptions.map((d) => d.id))
  }, [])

  const selectedDealerLabels = dealerOptions
    .filter((d) => dealers.includes(d.id))
    .map((d) => d.label)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Components</h1>
        <p className="mt-1 text-muted-foreground">
          Shared filters and controls used across the payroll dashboard (shadcn / site style).
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ComponentCard
          title="Date range picker"
          description="Two-month calendar in a popover — same control as the header date filter."
        >
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <Preview label="Selection">
            {dateRange?.from
              ? dateRange.to
                ? `${dateRange.from.toISOString().slice(0, 10)} → ${dateRange.to.toISOString().slice(0, 10)}`
                : dateRange.from.toISOString().slice(0, 10)
              : '—'}
          </Preview>
        </ComponentCard>

        <ComponentCard
          title="Dealer select"
          description="Single dealer dropdown with an “All Dealers” option."
        >
          <DealerSelect
            dealers={dealerOptions}
            value={dealer}
            onValueChange={setDealer}
          />
          <Preview label="Value">
            {dealer === 'all'
              ? 'All Dealers'
              : dealerOptions.find((d) => d.id === dealer)?.label ?? dealer}
          </Preview>
        </ComponentCard>

        <ComponentCard
          title="Dealer multi-select"
          description="Multi-check dealers with search and select-all — same behavior as SRS invoices (#id_dealer_multi)."
          className="lg:col-span-2"
        >
          <DealerMultiSelect
            dealers={dealerOptions}
            value={dealers}
            onChange={setDealers}
          />
          <Preview label={`Selected (${dealers.length})`}>
            {dealers.length === dealerOptions.length ? (
              <Badge variant="secondary">All Dealers</Badge>
            ) : dealers.length === 0 ? (
              <span className="text-muted-foreground">None</span>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedDealerLabels.map((name) => (
                  <Badge key={name} variant="outline">
                    {name}
                  </Badge>
                ))}
              </div>
            )}
          </Preview>
        </ComponentCard>
      </div>
    </div>
  )
}

function ComponentCard({
  title,
  description,
  children,
  className,
}: {
  title: string
  description: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

function Preview({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm">
      <p className="mb-1 font-medium text-muted-foreground">{label}</p>
      <div className="text-foreground">{children}</div>
    </div>
  )
}
