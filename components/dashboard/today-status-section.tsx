'use client'

import { format, parseISO } from 'date-fns'
import { Activity, Coffee, LogOut } from 'lucide-react'
import { KPICard } from '@/components/dashboard/kpi-card'
import { useTtkTodayStatus } from '@/hooks/use-ttk-today-status'

function formatStatusDate(value: string): string {
  if (!value) return 'Today'
  try {
    return format(parseISO(value), 'MMM d, yyyy')
  } catch {
    return 'Today'
  }
}

export function TodayStatusSection() {
  const { status, loading, error } = useTtkTodayStatus()

  const dateLabel = formatStatusDate(status.date)

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Today status</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Live headcount for {dateLabel} — independent of header filters
        </p>
        {error ? (
          <p className="mt-1 text-xs text-destructive">{error}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KPICard
          title="On lunch"
          value={status.on_lunch}
          subtitle="Break start without break end"
          icon={<Coffee className="h-7 w-7" />}
          variant="warning"
          loading={loading}
        />
        <KPICard
          title="Working"
          value={status.working}
          subtitle="Clocked in, not on break, no clock out"
          icon={<Activity className="h-7 w-7" />}
          variant="success"
          loading={loading}
        />
        <KPICard
          title="Out"
          value={status.out}
          subtitle="Already clocked out"
          icon={<LogOut className="h-7 w-7" />}
          variant="info"
          loading={loading}
        />
      </div>
    </section>
  )
}
