'use client'

import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { enUS, es } from 'date-fns/locale'
import { useRouter } from 'next/navigation'
import { Activity, Coffee, LogOut } from 'lucide-react'
import { KPICard } from '@/components/dashboard/kpi-card'
import { useTtkTodayStatus } from '@/hooks/use-ttk-today-status'
import { useFilters } from '@/lib/filter-context'
import { getTodayDateRange } from '@/lib/filters/date-range-presets'
import { type TodayLiveStatus } from '@/lib/ttk/today-live-status'
import { TODAY_LIVE_STATUS_CARDS } from '@/lib/ttk/today-live-status-cards'
import { useTranslation } from '@/lib/i18n/locale-context'
import { getTodayLiveStatusOptions } from '@/lib/i18n/label-helpers'

const CARD_ICONS: Record<TodayLiveStatus, React.ReactNode> = {
  on_lunch: <Coffee className="h-7 w-7" />,
  working: <Activity className="h-7 w-7" />,
  out: <LogOut className="h-7 w-7" />,
}

export function TodayStatusSection() {
  const router = useRouter()
  const { t, locale } = useTranslation()
  const dateFnsLocale = locale === 'es' ? es : enUS
  const { setDateRange, setSelectedTodayLiveStatus, setSelectedType } = useFilters()
  const { status, loading, error } = useTtkTodayStatus()

  const liveStatusLabels = useMemo(() => getTodayLiveStatusOptions(t), [t])

  const dateLabel = useMemo(() => {
    if (!status.date) return t('dashboard.today')
    try {
      return format(parseISO(status.date), 'MMM d, yyyy', { locale: dateFnsLocale })
    } catch {
      return t('dashboard.today')
    }
  }, [status.date, dateFnsLocale, t])

  const cards = useMemo(
    () =>
      TODAY_LIVE_STATUS_CARDS.map((card) => {
        const labels = liveStatusLabels.find((opt) => opt.value === card.status)
        return {
          ...card,
          title: labels?.label ?? card.title,
          subtitle: labels?.description ?? card.subtitle,
        }
      }),
    [liveStatusLabels],
  )

  const openPunchReport = (liveStatus: TodayLiveStatus) => {
    setSelectedType('all')
    setSelectedTodayLiveStatus(liveStatus)
    setDateRange(getTodayDateRange())
    router.push('/issues')
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          {t('dashboard.todayStatus')}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t('dashboard.todayStatusSubtitle', { date: dateLabel })}
        </p>
        {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((card) => (
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
