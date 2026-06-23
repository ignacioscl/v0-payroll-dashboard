import { cn } from '@/lib/utils'

interface TimeDiffBadgeProps {
  minutes: number | null
  showSign?: boolean
}

export function TimeDiffBadge({ minutes, showSign = true }: TimeDiffBadgeProps) {
  if (minutes === null) {
    return (
      <span className="text-xs text-muted-foreground">-</span>
    )
  }

  const isNegative = minutes < 0
  const absMinutes = Math.abs(minutes)
  
  const hours = Math.floor(absMinutes / 60)
  const mins = absMinutes % 60

  let display = ''
  if (hours > 0) {
    display = `${hours}h ${mins}m`
  } else {
    display = `${mins}m`
  }

  if (showSign) {
    display = isNegative ? `-${display}` : `+${display}`
  }

  return (
    <span className={cn(
      'inline-flex items-center rounded-md px-2 py-1 text-xs font-medium',
      isNegative 
        ? 'bg-emerald-500/10 text-emerald-500' 
        : 'bg-red-500/10 text-red-500'
    )}>
      {display}
    </span>
  )
}
