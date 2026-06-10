'use client'

import { Activity, Coffee, LogOut } from 'lucide-react'
import { KPICard } from '@/components/dashboard/kpi-card'
import { useTtkTodayStatus } from '@/hooks/use-ttk-today-status'
import { useFilters } from '@/lib/filter-context'
import { getTodayDateRange } from '@/lib/filters/date-range-presets'
import {
  TODAY_LIVE_STATUS_ALL,
  type TodayLiveStatus,
} from '@/lib/ttk/today-live-status'
import { TODAY_LIVE_STATUS_CARDS } from '@/lib/ttk/today-live-status-cards'

const CARD_ICONS: Record<TodayLiveStatus, React.ReactNode> = {
  on_lunch: <Coffee className="h-5 w-5" />,
  working: <Activity className="h-5 w-5" />,
  out: <LogOut className="h-5 w-5" />,
}

export function TodayLiveStatusFilterCards() {
  const { selectedTodayLiveStatus, setSelectedTodayLiveStatus, setDateRange } =
    useFilters()
  const { status, loading } = useTtkTodayStatus()

  const toggleLiveStatus = (liveStatus: TodayLiveStatus) => {
    if (selectedTodayLiveStatus === liveStatus) {
      setSelectedTodayLiveStatus(TODAY_LIVE_STATUS_ALL)
      return
    }
    setSelectedTodayLiveStatus(liveStatus)
    setDateRange(getTodayDateRange())
  }

  return (
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
          compact
          active={selectedTodayLiveStatus === card.status}
          onClick={() => toggleLiveStatus(card.status)}
        />
      ))}
    </div>
  )
}
