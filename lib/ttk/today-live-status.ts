export type TodayLiveStatus = 'on_lunch' | 'working' | 'out'

export const TODAY_LIVE_STATUS_ALL = 'all' as const

export type TodayLiveStatusFilter = typeof TODAY_LIVE_STATUS_ALL | TodayLiveStatus

export const TODAY_LIVE_STATUS_OPTIONS: {
  value: TodayLiveStatusFilter
  label: string
  description: string
}[] = [
  { value: TODAY_LIVE_STATUS_ALL, label: 'All statuses', description: 'No live-status filter' },
  { value: 'on_lunch', label: 'On lunch', description: 'Break started, not ended' },
  { value: 'working', label: 'Working', description: 'Clocked in, not on break, no clock out' },
  { value: 'out', label: 'Out', description: 'Already clocked out' },
]

export function isTodayLiveStatus(value: string): value is TodayLiveStatus {
  return value === 'on_lunch' || value === 'working' || value === 'out'
}

export function todayLiveStatusLabel(value: TodayLiveStatusFilter): string {
  return TODAY_LIVE_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value
}
