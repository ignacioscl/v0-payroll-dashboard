'use client'

import { CheckCircle2 } from 'lucide-react'
import { parsePunchErrorBadges } from '@/components/ttk/punch-error-indicator'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { formatFixedAt } from '@/lib/ttk/map-header-filters'
import { useTranslation } from '@/lib/i18n/locale-context'

/** Extract displayable error text from `fixed_error_snapshot` (JSON or plain). */
export function parseFixedErrorSnapshot(snapshot: string | null | undefined): string {
  if (!snapshot?.trim()) return ''
  const raw = snapshot.trim()
  try {
    const parsed = JSON.parse(raw) as { res?: string }
    if (parsed && typeof parsed.res === 'string' && parsed.res.trim()) {
      return parsed.res.trim()
    }
  } catch {
    /* plain text / legacy */
  }
  return raw
}

export function PunchFixedIndicator({
  fixedAt,
  fixedByName,
  errorSnapshot,
}: {
  fixedAt: string
  fixedByName?: string | null
  errorSnapshot?: string | null
}) {
  const { t } = useTranslation()
  const errorText = parseFixedErrorSnapshot(errorSnapshot)
  const badges = errorText ? parsePunchErrorBadges(errorText) : []
  const when = formatFixedAt(fixedAt) || fixedAt
  const who = fixedByName?.trim() || '—'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 cursor-pointer rounded-sm text-emerald-600 transition-colors hover:bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-emerald-400"
          aria-label={`${t('punch.corrected')} — ${t('punch.correctedBy')} ${who}, ${t('punch.correctedWhen')} ${when}`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-xs space-y-2.5 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('punch.corrected')}
        </p>
        <dl className="space-y-1 text-xs">
          <div>
            <dt className="text-muted-foreground">{t('punch.correctedBy')}</dt>
            <dd className="font-medium text-foreground">{who}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('punch.correctedWhen')}</dt>
            <dd className="font-medium tabular-nums text-foreground">{when}</dd>
          </div>
        </dl>
        {badges.length > 0 ? (
          <div className="space-y-1.5 border-t border-border pt-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('punch.previousIssues')}
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
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
