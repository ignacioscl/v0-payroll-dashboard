import { cn } from '@/lib/utils'

/** Wordmark sizes, in px of the "SRS" lettering. Everything else scales off this. */
const SRS_SIZE = {
  lg: 32,
  md: 24,
  sidebar: 18,
  compact: 15,
} as const

export type LogoSize = keyof typeof SRS_SIZE

interface LogoProps {
  size?: LogoSize
  /** false renders just "SRS" — no SUITE descriptor, no PRO chip. */
  descriptor?: boolean
  /** 'pro' shows the accent chip; anything else hides it. */
  tier?: 'pro' | 'base'
  /** 'dark' = sitting on the navy chrome, 'light' = on a white surface. */
  tone?: 'dark' | 'light'
  className?: string
}

export function Logo({
  size = 'sidebar',
  descriptor = true,
  tier = 'pro',
  tone = 'dark',
  className,
}: LogoProps) {
  const srsSize = SRS_SIZE[size]
  const scale = srsSize / SRS_SIZE.sidebar
  const onDark = tone === 'dark'

  const srs = (
    <span
      className={cn(
        'font-brand whitespace-nowrap font-normal leading-none',
        onDark ? 'text-white' : 'text-navy-900',
      )}
      style={{ fontSize: srsSize }}
    >
      SRS
    </span>
  )

  if (!descriptor) {
    return <span className={cn('inline-flex items-center', className)}>{srs}</span>
  }

  return (
    <span
      className={cn('inline-flex items-center', className)}
      style={{ gap: srsSize >= SRS_SIZE.md ? 13 : Math.round(9 * scale) }}
    >
      {srs}

      {srsSize >= SRS_SIZE.md && (
        <span
          aria-hidden
          className={cn('w-px', onDark ? 'bg-white/20' : 'bg-border')}
          style={{ height: Math.round(srsSize * 0.82) }}
        />
      )}

      <span
        className={cn(
          'whitespace-nowrap font-medium leading-none',
          onDark ? 'text-brand-suite' : 'text-muted-foreground',
        )}
        style={{
          fontSize: Math.round(10 * scale),
          letterSpacing: 'var(--brand-suite-tracking)',
        }}
      >
        SUITE
      </span>

      {tier === 'pro' && (
        <span
          className={cn(
            'bg-client-accent text-client-accent-foreground whitespace-nowrap font-bold leading-none',
            // On the navy chrome the chip needs an edge, or it vanishes whenever the
            // tenant accent is itself a navy.
            onDark && 'ring-1 ring-white/25',
          )}
          style={{
            fontSize: Math.round(8 * scale),
            letterSpacing: '0.08em',
            padding: `${Math.round(3 * scale)}px ${Math.round(5 * scale)}px`,
            borderRadius: Math.round(4 * scale),
          }}
        >
          PRO
        </span>
      )}
    </span>
  )
}
