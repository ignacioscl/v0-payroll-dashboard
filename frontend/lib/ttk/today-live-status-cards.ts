import type { KPICardVariant } from '@/components/dashboard/kpi-card'
import type { TodayLiveStatus } from '@/lib/ttk/today-live-status'
import type { TtkTodayStatusData } from '@/lib/ttk/ttk-today-status-types'

export type TodayLiveStatusCardMeta = {
  status: TodayLiveStatus
  title: string
  subtitle: string
  variant: KPICardVariant
  countKey: keyof TtkTodayStatusData
}

export const TODAY_LIVE_STATUS_CARDS: TodayLiveStatusCardMeta[] = [
  {
    status: 'on_lunch',
    title: 'On lunch',
    subtitle: 'Break start without break end',
    variant: 'warning',
    countKey: 'on_lunch',
  },
  {
    status: 'working',
    title: 'Working',
    subtitle: 'Clocked in, not on break, no clock out',
    variant: 'success',
    countKey: 'working',
  },
  {
    status: 'out',
    title: 'Out',
    subtitle: 'Already clocked out',
    variant: 'info',
    countKey: 'out',
  },
]
