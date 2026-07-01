'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type PageHeadingVariant =
  | 'default'
  | 'warning'
  | 'danger'
  | 'success'
  | 'info'
  | 'violet'

const variantConfig: Record<
  PageHeadingVariant,
  { iconBg: string; iconShadow: string }
> = {
  default: {
    iconBg: 'bg-gradient-to-br from-blue-500 to-blue-700',
    iconShadow: 'shadow-lg shadow-blue-500/30',
  },
  warning: {
    iconBg: 'bg-gradient-to-br from-amber-400 to-orange-600',
    iconShadow: 'shadow-lg shadow-amber-400/30',
  },
  danger: {
    iconBg: 'bg-gradient-to-br from-red-500 to-rose-700',
    iconShadow: 'shadow-lg shadow-red-500/30',
  },
  success: {
    iconBg: 'bg-gradient-to-br from-emerald-400 to-green-700',
    iconShadow: 'shadow-lg shadow-emerald-500/30',
  },
  info: {
    iconBg: 'bg-gradient-to-br from-cyan-400 to-sky-700',
    iconShadow: 'shadow-lg shadow-cyan-400/30',
  },
  violet: {
    iconBg: 'bg-gradient-to-br from-violet-500 to-purple-700',
    iconShadow: 'shadow-lg shadow-violet-500/30',
  },
}

interface PageHeadingProps {
  title: string
  subtitle?: ReactNode
  icon: ReactNode
  variant?: PageHeadingVariant
  actions?: ReactNode
  className?: string
}

export function PageHeading({
  title,
  subtitle,
  icon,
  variant = 'default',
  actions,
  className,
}: PageHeadingProps) {
  const config = variantConfig[variant]

  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="flex min-w-0 items-start gap-4">
        <div
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white',
            config.iconBg,
            config.iconShadow,
          )}
          aria-hidden
        >
          <span className="drop-shadow-sm [&>svg]:h-6 [&>svg]:w-6">{icon}</span>
        </div>
        <div className="min-w-0 pt-0.5">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle ? (
            <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  )
}
