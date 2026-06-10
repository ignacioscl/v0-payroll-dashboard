'use client'

import { format, parseISO } from 'date-fns'
import { useRouter } from 'next/navigation'
import { Activity, Coffee, LogOut } from 'lucide-react'
import { KPICard } from '@/components/dashboard/kpi-card'
import { useTtkTodayStatus } from '@/hooks/use-ttk-today-status'
import { useFilters } from '@/lib/filter-context'
import { getTodayDateRange } from '@/lib/filters/date-range-presets'
import { type TodayLiveStatus } from '@/lib/ttk/today-live-status'
import { TODAY_LIVE_STATUS_CARDS } from '@/lib/ttk/today-live-status-cards'

function formatStatusDate(value: string): string {
  if (!value) return 'Today'
  try {
    return format(parseISO(value), 'MMM d, yyyy')
  } catch {
    return 'Today'
  }
}

const CARD_ICONS: Record<TodayLiveStatus, React.ReactNode> = {
  on_lunch: <Coffee className="h-7 w-7" />,
  working: <Activity className="h-7 w-7" />,
  out: <LogOut className="h-7 w-7" />,
}

export function TodayStatusSection() {
  const router = useRouter()
  const { setDateRange, setSelectedTodayLiveStatus, setSelectedType } = useFilters()
  const { status, loading, error } = useTtkTodayStatus()

  const dateLabel = formatStatusDate(status.date)

  const openPunchReport = (liveStatus: TodayLiveStatus) => {
    setSelectedType('all')
    setSelectedTodayLiveStatus(liveStatus)
    setDateRange(getTodayDateRange())
    router.push('/issues')
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Today status</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Live headcount for {dateLabel} — click a card to view employees in Punch Report
        </p>
        {error ? (
          <p className="mt-1 text-xs text-destructive">{error}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {TODAY_LIVE_STATUS_CARDS.map((card) => (
          <KPICard
            key={card.status}
            title={card.title}
            value={status[card.countKey]}
            subtitle={card.subtitle}
            icon={CARD_ICONS[card.status]}
            variant={card.variant}
            loading={loading}
            onClick={() => openPunchReport(card.status)}
          />
        ))}
      </div>
    </section>
  )
}
