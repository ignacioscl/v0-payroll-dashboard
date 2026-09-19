'use client'

import type { ReactNode } from 'react'
import {
  Coffee,
  DollarSign,
  Hand,
  LogOut,
  MapPin,
  Repeat2,
  Timer,
  Trash2,
} from 'lucide-react'
import { KPICard, type KPICardVariant } from '@/components/dashboard/kpi-card'
import { useTranslation } from '@/lib/i18n/locale-context'
import {
  FLAG_GROUPS,
  flagEnabledIn,
  type FlagTypeCode,
  type FlagTypeMeta,
} from '@/lib/ttk/error-type-meta'
import type { ErrorStatus } from '@/lib/ttk/error-status'
import type { TtkIssueCountByType } from '@/lib/ttk/ttk-issue-counts-types'

const FLAG_TYPE_ICONS: Record<FlagTypeCode, ReactNode> = {
  1: <LogOut className="h-5 w-5" />,
  2: <Coffee className="h-5 w-5" />,
  3: <Timer className="h-5 w-5" />,
  4: <DollarSign className="h-5 w-5" />,
  5: <Hand className="h-5 w-5" />,
  6: <Trash2 className="h-5 w-5" />,
  7: <Repeat2 className="h-5 w-5" />,
  8: <MapPin className="h-5 w-5" />,
}

export function flagTypeIcon(code: FlagTypeCode): ReactNode {
  return FLAG_TYPE_ICONS[code]
}

export function flagTypeVariant(meta: FlagTypeMeta): KPICardVariant {
  return meta.variant
}

function byTypeCount(byType: TtkIssueCountByType | undefined, key: string): number {
  if (!byType) return 0
  const value = (byType as Record<string, number | undefined>)[key]
  return typeof value === 'number' ? value : 0
}

export type FlagTypeCardsProps = {
  status: ErrorStatus
  visibleMetas: readonly FlagTypeMeta[]
  byType?: TtkIssueCountByType
  fakeGpsWithData?: number
  includedErrorTypes: readonly number[]
  /** Si false (All punches), las que aplican al modo se ven grisadas con número. */
  typesActive: boolean
  onToggle: (code: number) => void
  loading?: boolean
  compact?: boolean
  /** Sufijo Pending/Corrected en el título (Dashboard). */
  showStatusSuffix?: boolean
}

export function FlagTypeCards({
  status,
  visibleMetas,
  byType,
  fakeGpsWithData,
  includedErrorTypes,
  typesActive,
  onToggle,
  loading = false,
  compact = false,
  showStatusSuffix = false,
}: FlagTypeCardsProps) {
  const { t } = useTranslation()
  const groups = FLAG_GROUPS.filter((group) => visibleMetas.some((meta) => meta.group === group.id))

  return (
    <div className="space-y-5">
      {groups.map((group) => {
        const metas = visibleMetas.filter((meta) => meta.group === group.id)
        const cols =
          group.id === 'errors'
            ? 'grid-cols-1 gap-3 @[640px]/flag-types:grid-cols-2 @[900px]/flag-types:grid-cols-4'
            : group.id === 'corrected_only'
              ? 'grid-cols-1 gap-3 @[640px]/flag-types:grid-cols-2 @[900px]/flag-types:grid-cols-3'
              : 'grid-cols-1 gap-3 @[640px]/flag-types:grid-cols-2 @[900px]/flag-types:grid-cols-3'
        return (
          <div key={group.id}>
            <div className="mb-3 flex flex-wrap items-baseline gap-2">
              <h4 className="text-[13px] font-semibold text-foreground">{t(group.titleKey)}</h4>
              <p className="text-[11px] text-muted-foreground">{t(group.hintKey)}</p>
            </div>
            <div className={`grid ${cols}`}>
              {metas.map((meta) => {
                const enabled = flagEnabledIn(meta, status)
                const included = includedErrorTypes.includes(meta.code)
                const excluded = typesActive && enabled && !included
                const inactive = !enabled || !typesActive
                const count = byTypeCount(byType, meta.byTypeKey)
                const title = showStatusSuffix
                  ? `${t(meta.labelKey)} · ${
                      status === 'corrected'
                        ? t('punch.errorStatusCorrected')
                        : t('punch.errorStatusPending')
                    }`
                  : t(meta.labelKey)

                let subtitle: React.ReactNode
                if (!enabled) {
                  subtitle = (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {status === 'pending'
                        ? t('punch.flagOnlyInCorrected')
                        : t('punch.flagNotCorrected')}
                    </span>
                  )
                } else if (meta.kind === 'fake_gps' && fakeGpsWithData != null) {
                  subtitle = t('punch.fakeGpsWithData', { count: fakeGpsWithData })
                }

                return (
                  <KPICard
                    key={`flag-type-${meta.code}`}
                    title={title}
                    value={enabled ? count : '—'}
                    subtitle={subtitle}
                    icon={FLAG_TYPE_ICONS[meta.code]}
                    variant={meta.variant}
                    loading={loading}
                    filterCard
                    inline
                    compact={compact}
                    onClick={typesActive && enabled ? () => onToggle(meta.code) : undefined}
                    active={typesActive && enabled && included}
                    excluded={excluded}
                    inactive={inactive}
                    hintKey="issues.error-types"
                    hint={
                      !enabled
                        ? undefined
                        : !typesActive
                          ? t('punch.errorTypeHintInactive')
                          : excluded
                            ? t('punch.errorTypeHintExcluded', { type: t(meta.labelKey) })
                            : t('punch.errorTypeHintIncluded', { type: t(meta.labelKey) })
                    }
                  />
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function FlagTypeBreakdown({
  metas,
  byType,
  totalPunches,
  asRate = false,
}: {
  metas: readonly FlagTypeMeta[]
  byType?: TtkIssueCountByType
  totalPunches?: number
  asRate?: boolean
}) {
  const { t } = useTranslation()
  if (metas.length === 0) return null
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]">
      {metas.map((meta) => {
        const count = byTypeCount(byType, meta.byTypeKey)
        const value =
          asRate && totalPunches && totalPunches > 0
            ? `${Math.round((count / totalPunches) * 1000) / 10}%`
            : count
        return (
          <span key={meta.code}>
            {t(meta.labelKey)}{' '}
            <span className="font-medium text-foreground">{value}</span>
          </span>
        )
      })}
    </div>
  )
}
