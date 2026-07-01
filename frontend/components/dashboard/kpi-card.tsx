'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { Check, HelpCircle, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTranslation } from '@/lib/i18n/locale-context'

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
  /** Estilo FullKpiCard del design system (Punch Report filters). */
  filterCard?: boolean
  /** Si está presente, muestra un icono de ayuda (?) que abre un popover con la descripción del KPI. */
  help?: ReactNode
  /** Valor completo al hacer click cuando `value` está abreviado (p. ej. $40.2k → $40,162). */
  valueFull?: string
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
  filterCard = false,
  help,
  valueFull,
  className,
}: KPICardProps) {
  const { t } = useTranslation()
  const [valueExpanded, setValueExpanded] = useState(false)

  useEffect(() => {
    setValueExpanded(false)
  }, [value, valueFull])

  const canExpandValue = Boolean(valueFull && valueFull !== value && value !== '—')
  const displayedValue = valueExpanded && valueFull ? valueFull : value
  const variantConfig = {
    default: {
      bg: 'bg-gradient-to-br from-white to-blue-50/60',
      border: 'border-blue-100',
      activeBorder: 'border-blue-600/70',
      iconBg: 'bg-gradient-to-br from-blue-500 to-blue-700',
      iconColor: 'text-white',
      iconShadow: 'shadow-lg shadow-blue-500/30',
      glow: 'shadow-primary/10'
    },
    warning: {
      bg: 'bg-gradient-to-br from-white to-amber-50/70',
      border: 'border-warning/25',
      activeBorder: 'border-amber-500/70',
      iconBg: 'bg-gradient-to-br from-amber-400 to-orange-600',
      iconColor: 'text-white',
      iconShadow: 'shadow-lg shadow-amber-400/30',
      glow: 'shadow-warning/15'
    },
    danger: {
      bg: 'bg-gradient-to-br from-white to-red-50/70',
      border: 'border-destructive/25',
      activeBorder: 'border-red-600/70',
      iconBg: 'bg-gradient-to-br from-red-500 to-rose-700',
      iconColor: 'text-white',
      iconShadow: 'shadow-lg shadow-red-500/30',
      glow: 'shadow-destructive/15'
    },
    success: {
      bg: 'bg-gradient-to-br from-white to-emerald-50/70',
      border: 'border-success/25',
      activeBorder: 'border-emerald-600/70',
      iconBg: 'bg-gradient-to-br from-emerald-400 to-green-700',
      iconColor: 'text-white',
      iconShadow: 'shadow-lg shadow-emerald-500/30',
      glow: 'shadow-success/15'
    },
    info: {
      bg: 'bg-gradient-to-br from-white to-cyan-50/70',
      border: 'border-accent/25',
      activeBorder: 'border-cyan-600/70',
      iconBg: 'bg-gradient-to-br from-cyan-400 to-sky-700',
      iconColor: 'text-white',
      iconShadow: 'shadow-lg shadow-cyan-400/30',
      glow: 'shadow-accent/15'
    },
    violet: {
      bg: 'bg-gradient-to-br from-white to-violet-50/70',
      border: 'border-violet-200/60',
      activeBorder: 'border-violet-600/70',
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
        'group relative overflow-hidden border transition-all duration-300',
        filterCard ? 'rounded-[14px] p-5 hover:scale-[1.01]' : 'rounded-xl',
        !filterCard && (compact ? 'p-4 hover:shadow-lg hover:scale-[1.01]' : 'p-5 hover:shadow-xl hover:scale-[1.02]'),
        filterCard && 'hover:shadow-md',
        'hover:border-border/80',
        config.bg,
        active && filterCard
          ? cn('border-2 shadow-md', config.activeBorder)
          : active
            ? 'border-2 ring-2 ring-primary/60 border-primary shadow-lg'
            : cn('border', config.border),
        !active && config.glow,
        isInteractive && 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        className,
      )}
    >
      {active && filterCard ? (
        <div
          className={cn(
            'absolute inset-x-0 top-0 h-[3px] rounded-t-[14px]',
            config.iconBg,
          )}
          aria-hidden
        />
      ) : null}

      <div className="relative flex items-start justify-between gap-2">
        <div className={cn('min-w-0 flex-1', filterCard ? 'space-y-1.5' : 'space-y-2')}>
          <div className="flex items-center gap-1">
            <p
              className={cn(
                'font-semibold uppercase tracking-wider leading-snug text-muted-foreground',
                filterCard
                  ? 'text-[11px] whitespace-normal'
                  : compact
                    ? 'text-[11px] whitespace-normal font-medium'
                    : 'text-xs truncate font-medium',
              )}
            >
              {title}
            </p>
            {help ? (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    aria-label={t('common.kpiHelpAria')}
                    className="shrink-0 cursor-pointer text-muted-foreground/50 transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-72 text-xs leading-relaxed text-muted-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="mb-1 text-sm font-semibold text-foreground">{title}</p>
                  {help}
                </PopoverContent>
              </Popover>
            ) : null}
          </div>

          <div className="flex items-baseline gap-2">
            {loading ? (
              <Loader2
                className={cn(
                  'animate-spin text-muted-foreground',
                  filterCard ? 'h-7 w-7' : compact ? 'h-6 w-6' : 'h-8 w-8',
                )}
              />
            ) : canExpandValue ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setValueExpanded((prev) => !prev)
                }}
                aria-expanded={valueExpanded}
                title={valueFull}
                className={cn(
                  'cursor-pointer rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                  filterCard ? 'text-[34px] leading-none' : compact ? 'text-3xl' : 'text-4xl',
                  'font-bold text-foreground tracking-tight tabular-nums',
                )}
              >
                <motion.span
                  key={String(displayedValue)}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  {displayedValue}
                </motion.span>
              </button>
            ) : (
              <motion.span
                key={String(value)}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className={cn(
                  'font-bold text-foreground tracking-tight tabular-nums',
                  filterCard ? 'text-[34px] leading-none' : compact ? 'text-3xl' : 'text-4xl',
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
                <div className={cn('text-muted-foreground', filterCard ? 'text-[11px]' : 'text-xs')}>
                  {subtitle}
                </div>
              )}
            </div>
          )}
        </div>

        <div className={cn(
          'relative flex shrink-0 items-center justify-center transition-all duration-300',
          'group-hover:scale-110 group-hover:-translate-y-0.5',
          filterCard
            ? 'h-[52px] w-[52px] rounded-[14px]'
            : compact
              ? 'h-9 w-9 rounded-xl'
              : 'h-14 w-14 rounded-2xl',
          config.iconBg,
          config.iconShadow
        )}>
          <span className={cn('transition-colors drop-shadow-sm', config.iconColor)}>
            {icon}
          </span>
        </div>
      </div>

      {active && filterCard ? (
        <div
          className={cn(
            'pointer-events-none absolute right-2.5 top-2.5 z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full shadow-sm',
            config.iconBg,
          )}
          aria-hidden
        >
          <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
        </div>
      ) : null}

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
