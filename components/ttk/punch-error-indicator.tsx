'use client'

import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, Clock, Coffee, Timer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

type PunchErrorBadge = {
  label: string
  className: string
  icon: LucideIcon
}

function classifyPunchError(label: string): PunchErrorBadge {
  const lower = label.toLowerCase()
  if (lower.includes('20 hour')) {
    return {
      label,
      className:
        'border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-200',
      icon: Timer,
    }
  }
  if (lower.includes('break')) {
    return {
      label,
      className:
        'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200',
      icon: Coffee,
    }
  }
  if (lower.includes('clock out')) {
    return {
      label,
      className:
        'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200',
      icon: Clock,
    }
  }
  return {
    label,
    className: 'border-destructive/30 bg-destructive/10 text-destructive',
    icon: AlertTriangle,
  }
}

export function parsePunchErrorBadges(res: string): PunchErrorBadge[] {
  return res
    .split(/<br\s*\/?>|\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(classifyPunchError)
}

export function PunchErrorIndicator({ errorText }: { errorText: string }) {
  const badges = parsePunchErrorBadges(errorText)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 cursor-pointer rounded-sm text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Punch errors: ${errorText}`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-xs space-y-2 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Punch issues
        </p>
        <div className="flex flex-col gap-1.5">
          {badges.map((badge) => {
            const Icon = badge.icon
            return (
              <Badge
                key={badge.label}
                variant="outline"
                className={cn(
                  'h-auto whitespace-normal py-1 text-[11px] font-medium leading-snug',
                  badge.className,
                )}
              >
                <Icon className="size-3 shrink-0" />
                {badge.label}
              </Badge>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
