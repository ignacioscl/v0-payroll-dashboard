'use client'

import * as React from 'react'
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
import { getTodayLiveStatusOptions } from '@/lib/i18n/label-helpers'
import { useTranslation } from '@/lib/i18n/locale-context'

const CARD_ICONS: Record<TodayLiveStatus, React.ReactNode> = {
  on_lunch: <Coffee className="h-5 w-5" />,
  working: <Activity className="h-5 w-5" />,
  out: <LogOut className="h-5 w-5" />,
}

export function TodayLiveStatusFilterCards() {
  const { t } = useTranslation()
  const { selectedTodayLiveStatus, setSelectedTodayLiveStatus, setDateRange, setSelectedType } =
    useFilters()
  const { status, loading } = useTtkTodayStatus()

  const liveStatusLabels = React.useMemo(
    () =>
      Object.fromEntries(
        getTodayLiveStatusOptions(t)
          .filter((opt) => opt.value !== 'all')
          .map((opt) => [opt.value, { title: opt.label, subtitle: opt.description }]),
      ) as Record<TodayLiveStatus, { title: string; subtitle: string }>,
    [t],
  )

  const toggleLiveStatus = (liveStatus: TodayLiveStatus) => {
    if (selectedTodayLiveStatus === liveStatus) {
      setSelectedTodayLiveStatus(TODAY_LIVE_STATUS_ALL)
      return
    }
    setSelectedTodayLiveStatus(liveStatus)
    setSelectedType('all')
    setDateRange(getTodayDateRange())
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {TODAY_LIVE_STATUS_CARDS.map((card) => {
        const labels = liveStatusLabels[card.status]
        return (
          <KPICard
            key={card.status}
            title={labels?.title ?? card.title}
            value={status[card.countKey]}
            subtitle={labels?.subtitle ?? card.subtitle}
            icon={CARD_ICONS[card.status]}
            variant={card.variant}
            loading={loading}
            filterCard
            active={selectedTodayLiveStatus === card.status}
            onClick={() => toggleLiveStatus(card.status)}
          />
        )
      })}
    </div>
  )
}
