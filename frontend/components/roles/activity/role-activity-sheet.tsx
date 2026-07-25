'use client'

import { History } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useTranslation } from '@/lib/i18n/locale-context'

export type RoleActivityRow = {
  id: number
  action: string
  summary: string
  detailJson: Record<string, unknown> | null
  authorNombre: string
  createdAt: string
}

export type RoleActivitySheetProps = {
  title: string
  subtitle: string
  rows: RoleActivityRow[]
  isLoading: boolean
  emptyMessage: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

type NamedActivityItem = {
  id: number
  nombre: string
}

type ActivityDetail = {
  added: NamedActivityItem[]
  removed: NamedActivityItem[]
  syncedRoles: NamedActivityItem[]
}

function formatWhen(iso: string | undefined, locale: string): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso

  return date.toLocaleString(locale === 'es' ? 'es-AR' : 'en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function getNamedItems(value: unknown): NamedActivityItem[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    const candidate = item as { id?: unknown; nombre?: unknown } | null

    if (
      !candidate ||
      typeof candidate !== 'object' ||
      typeof candidate.nombre !== 'string' ||
      !candidate.nombre.trim()
    ) {
      return []
    }

    return [{
      id: typeof candidate.id === 'number' ? candidate.id : 0,
      nombre: candidate.nombre,
    }]
  })
}

function getActivityDetail(detailJson: Record<string, unknown> | null): ActivityDetail {
  if (!detailJson) return { added: [], removed: [], syncedRoles: [] }

  return {
    added: getNamedItems(detailJson.added),
    removed: getNamedItems(detailJson.removed),
    syncedRoles: getNamedItems(detailJson.syncedRoles),
  }
}

function ActivityList({
  title,
  items,
  className,
  prefix,
}: {
  title: string
  items: NamedActivityItem[]
  className: string
  prefix: string
}) {
  if (items.length === 0) return null

  return (
    <section className={`mt-3 rounded-md border px-2.5 py-2 ${className}`}>
      <h3 className="text-xs font-medium">{title}</h3>
      <ul className="mt-1 space-y-0.5 text-xs">
        {items.map((item, index) => (
          <li key={`${item.id}-${item.nombre}-${index}`} className="leading-snug">
            <span aria-hidden>{prefix} </span>
            {item.nombre}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function RoleActivitySheet({
  title,
  subtitle,
  rows,
  isLoading,
  emptyMessage,
  open,
  onOpenChange,
}: RoleActivitySheetProps) {
  const { t, locale } = useTranslation()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex min-h-0 w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <SheetHeader className="shrink-0 border-b border-border px-4 py-4 pr-12 text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <History className="size-4" aria-hidden />
            {title}
          </SheetTitle>
          <SheetDescription className="text-xs">{subtitle}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1 px-4 py-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t('roleTemplates.activityLoading')}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          ) : (
            <ul className="space-y-3">
              {rows.map((row) => {
                const detail = getActivityDetail(row.detailJson)

                return (
                  <li
                    key={row.id}
                    className="rounded-md border border-border/80 bg-muted/20 px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px] font-normal">
                        {row.action}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatWhen(row.createdAt, locale)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm leading-snug">{row.summary}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('roleTemplates.activityBy', { name: row.authorNombre })}
                    </p>
                    <ActivityList
                      title={t('roleTemplates.activityAdded')}
                      items={detail.added}
                      prefix="+"
                      className="border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"
                    />
                    <ActivityList
                      title={t('roleTemplates.activityRemoved')}
                      items={detail.removed}
                      prefix="−"
                      className="border-destructive/30 bg-destructive/5 text-destructive"
                    />
                    <ActivityList
                      title={t('roleTemplates.activitySyncedRoles')}
                      items={detail.syncedRoles}
                      prefix="•"
                      className="border-border bg-background/60 text-foreground"
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
