import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  trend?: {
    value: number
    label: string
  }
  variant?: 'default' | 'warning' | 'danger' | 'success'
}

export function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = 'default'
}: KPICardProps) {
  const variantStyles = {
    default: 'bg-card border-border',
    warning: 'bg-amber-500/10 border-amber-500/30',
    danger: 'bg-red-500/10 border-red-500/30',
    success: 'bg-emerald-500/10 border-emerald-500/30'
  }

  const iconStyles = {
    default: 'bg-primary/10 text-primary',
    warning: 'bg-amber-500/20 text-amber-500',
    danger: 'bg-red-500/20 text-red-500',
    success: 'bg-emerald-500/20 text-emerald-500'
  }

  return (
    <div className={cn(
      'rounded-xl border p-5 transition-all hover:shadow-lg',
      variantStyles[variant]
    )}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold text-foreground">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
          {trend && (
            <p className={cn(
              'text-xs font-medium',
              trend.value >= 0 ? 'text-emerald-500' : 'text-red-500'
            )}>
              {trend.value >= 0 ? '+' : ''}{trend.value}% {trend.label}
            </p>
          )}
        </div>
        <div className={cn(
          'flex h-12 w-12 items-center justify-center rounded-lg',
          iconStyles[variant]
        )}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  )
}
