'use client'

import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

export type KPICardVariant =
  | 'default'
  | 'warning'
  | 'danger'
  | 'success'
  | 'info'
  | 'violet'

interface KPICardProps {
  title: string
  value: string | number
  subtitle?: ReactNode
  icon: ReactNode
  trend?: {
    value: number
    label: string
  }
  variant?: KPICardVariant
  sparkline?: number[]
  /** Si está presente, la tarjeta es clickeable y se comporta como botón. */
  onClick?: () => void
  /** Marca la tarjeta como seleccionada (ring + borde primary). */
  active?: boolean
  /** Reemplaza el value por un spinner. */
  loading?: boolean
  /** Tarjetas más compactas (p. ej. Punch Issues): iconos chicos y título sin truncar. */
  compact?: boolean
  className?: string
}

export function KPICard({
  title,
  value,
  subtitle,
  icon,
  trend,
  variant = 'default',
  sparkline,
  onClick,
  active = false,
  loading = false,
  compact = false,
  className,
}: KPICardProps) {
  const variantConfig = {
    default: {
      bg: 'bg-gradient-to-br from-white to-blue-50/60',
      border: 'border-blue-100',
      iconBg: 'bg-gradient-to-br from-blue-500 to-blue-700',
      iconColor: 'text-white',
      iconShadow: 'shadow-lg shadow-blue-500/30',
      glow: 'shadow-primary/10'
    },
    warning: {
      bg: 'bg-gradient-to-br from-white to-amber-50/70',
      border: 'border-warning/25',
      iconBg: 'bg-gradient-to-br from-amber-400 to-orange-600',
      iconColor: 'text-white',
      iconShadow: 'shadow-lg shadow-amber-400/30',
      glow: 'shadow-warning/15'
    },
    danger: {
      bg: 'bg-gradient-to-br from-white to-red-50/70',
      border: 'border-destructive/25',
      iconBg: 'bg-gradient-to-br from-red-500 to-rose-700',
      iconColor: 'text-white',
      iconShadow: 'shadow-lg shadow-red-500/30',
      glow: 'shadow-destructive/15'
    },
    success: {
      bg: 'bg-gradient-to-br from-white to-emerald-50/70',
      border: 'border-success/25',
      iconBg: 'bg-gradient-to-br from-emerald-400 to-green-700',
      iconColor: 'text-white',
      iconShadow: 'shadow-lg shadow-emerald-500/30',
      glow: 'shadow-success/15'
    },
    info: {
      bg: 'bg-gradient-to-br from-white to-cyan-50/70',
      border: 'border-accent/25',
      iconBg: 'bg-gradient-to-br from-cyan-400 to-sky-700',
      iconColor: 'text-white',
      iconShadow: 'shadow-lg shadow-cyan-400/30',
      glow: 'shadow-accent/15'
    },
    violet: {
      bg: 'bg-gradient-to-br from-white to-violet-50/70',
      border: 'border-violet-200/60',
      iconBg: 'bg-gradient-to-br from-violet-500 to-purple-700',
      iconColor: 'text-white',
      iconShadow: 'shadow-lg shadow-violet-500/30',
      glow: 'shadow-violet-500/15'
    }
  }

  const config = variantConfig[variant]

  // Calculate sparkline path
  const getSparklinePath = () => {
    if (!sparkline || sparkline.length < 2) return ''
    const max = Math.max(...sparkline)
    const min = Math.min(...sparkline)
    const range = max - min || 1
    const width = 80
    const height = 32
    const points = sparkline.map((val, i) => {
      const x = (i / (sparkline.length - 1)) * width
      const y = height - ((val - min) / range) * height
      return `${x},${y}`
    })
    return `M ${points.join(' L ')}`
  }

  const isInteractive = typeof onClick === 'function'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onClick={onClick}
      onKeyDown={
        isInteractive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-pressed={isInteractive ? active : undefined}
      className={cn(
        'group relative overflow-hidden rounded-xl border transition-all duration-300',
        compact ? 'p-4 hover:shadow-lg hover:scale-[1.01]' : 'p-5 hover:shadow-xl hover:scale-[1.02]',
        'hover:border-border/80',
        config.bg,
        config.border,
        config.glow,
        isInteractive && 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        active && 'ring-2 ring-primary/60 border-primary shadow-lg',
        className,
      )}
    >

      <div className="relative flex items-start justify-between gap-2">
        <div className="space-y-2 flex-1 min-w-0">
          <p
            className={cn(
              'font-medium text-muted-foreground uppercase tracking-wider leading-snug',
              compact ? 'text-[11px] whitespace-normal' : 'text-xs truncate',
            )}
          >
            {title}
          </p>

          <div className="flex items-baseline gap-2">
            {loading ? (
              <Loader2 className={cn('animate-spin text-muted-foreground', compact ? 'h-6 w-6' : 'h-8 w-8')} />
            ) : (
              <motion.span
                key={String(value)}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className={cn(
                  'font-bold text-foreground tracking-tight tabular-nums',
                  compact ? 'text-3xl' : 'text-4xl',
                )}
              >
                {value}
              </motion.span>
            )}
          </div>

          {(trend || subtitle) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {trend && (
                <span className={cn(
                  'inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full',
                  trend.value >= 0
                    ? 'bg-success/10 text-success'
                    : 'bg-destructive/10 text-destructive'
                )}>
                  <svg
                    className={cn('w-3 h-3', trend.value < 0 && 'rotate-180')}
                    viewBox="0 0 12 12"
                    fill="none"
                  >
                    <path
                      d="M6 2L10 7H2L6 2Z"
                      fill="currentColor"
                    />
                  </svg>
                  {Math.abs(trend.value)}%
                </span>
              )}
              {subtitle && (
                <div className="text-xs text-muted-foreground">
                  {subtitle}
                </div>
              )}
            </div>
          )}
        </div>

        <div className={cn(
          'flex shrink-0 items-center justify-center transition-all duration-300',
          'group-hover:scale-110 group-hover:-translate-y-0.5',
          compact ? 'h-9 w-9 rounded-xl' : 'h-14 w-14 rounded-2xl',
          config.iconBg,
          config.iconShadow
        )}>
          <span className={cn('transition-colors drop-shadow-sm', config.iconColor)}>
            {icon}
          </span>
        </div>
      </div>

      {/* Optional sparkline */}
      {sparkline && sparkline.length > 1 && (
        <div className="mt-4 pt-4 border-t border-border/50">
          <svg width="100%" height="32" className="overflow-visible">
            <defs>
              <linearGradient id={`gradient-${variant}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d={getSparklinePath()}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={config.iconColor}
            />
          </svg>
        </div>
      )}
    </motion.div>
  )
}
