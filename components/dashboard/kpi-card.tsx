'use client'

import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: ReactNode
  trend?: {
    value: number
    label: string
  }
  variant?: 'default' | 'warning' | 'danger' | 'success' | 'info'
  sparkline?: number[]
}

export function KPICard({
  title,
  value,
  subtitle,
  icon,
  trend,
  variant = 'default',
  sparkline
}: KPICardProps) {
  const variantConfig = {
    default: {
      bg: 'bg-card',
      border: 'border-border',
      iconBg: 'bg-primary/10',
      iconColor: 'text-primary',
      glow: 'shadow-primary/5'
    },
    warning: {
      bg: 'bg-card',
      border: 'border-warning/20',
      iconBg: 'bg-warning/10',
      iconColor: 'text-warning',
      glow: 'shadow-warning/10'
    },
    danger: {
      bg: 'bg-card',
      border: 'border-destructive/20',
      iconBg: 'bg-destructive/10',
      iconColor: 'text-destructive',
      glow: 'shadow-destructive/10'
    },
    success: {
      bg: 'bg-card',
      border: 'border-success/20',
      iconBg: 'bg-success/10',
      iconColor: 'text-success',
      glow: 'shadow-success/10'
    },
    info: {
      bg: 'bg-card',
      border: 'border-accent/20',
      iconBg: 'bg-accent/10',
      iconColor: 'text-accent',
      glow: 'shadow-accent/10'
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'group relative overflow-hidden rounded-xl border p-5 transition-all duration-300',
        'hover:shadow-xl hover:scale-[1.02] hover:border-border/80',
        config.bg,
        config.border,
        config.glow
      )}
    >
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
      
      <div className="relative flex items-start justify-between">
        <div className="space-y-3 flex-1">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            {title}
          </p>
          
          <div className="flex items-baseline gap-2">
            <motion.span 
              key={value}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-4xl font-bold text-foreground tracking-tight"
            >
              {value}
            </motion.span>
          </div>

          <div className="flex items-center gap-3">
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
              <p className="text-xs text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className={cn(
          'flex h-14 w-14 items-center justify-center rounded-xl transition-all duration-300',
          'group-hover:scale-110',
          config.iconBg
        )}>
          <span className={cn('transition-colors', config.iconColor)}>
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
