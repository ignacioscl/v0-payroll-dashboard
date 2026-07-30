'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Info,
  Search,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  useRoleTemplatePermissions,
  useSetRoleTemplatePermissions,
} from '@/hooks/use-role-template-permissions'
import { useTranslation } from '@/lib/i18n/locale-context'
import { groupRolePermissions } from '@/lib/roles/group-role-permissions.mjs'
import type { RoleTemplateRow } from '@/lib/srs-role-templates-api'
import { cn } from '@/lib/utils'

export type RoleTemplatePermissionsSheetProps = {
  template: RoleTemplateRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RoleTemplatePermissionsSheet({
  template,
  open,
  onOpenChange,
}: RoleTemplatePermissionsSheetProps) {
  const { t } = useTranslation()
  const id = template?.id ?? null
  const query = useRoleTemplatePermissions(id, open && id != null)
  const mutation = useSetRoleTemplatePermissions()
  const [pendingIds, setPendingIds] = React.useState<Set<number>>(() => new Set())
  const [searchState, setSearchState] = React.useState<{
    templateId: number | null
    value: string
  }>({ templateId: null, value: '' })
  /** Group keys present here are collapsed; absent = expanded. Default: all collapsed. */
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(
    () => new Set(),
  )
  const [collapsedInitForTemplateId, setCollapsedInitForTemplateId] =
    React.useState<number | null>(null)

  React.useEffect(() => {
    setCollapsedGroups(new Set())
    setCollapsedInitForTemplateId(null)
  }, [id])

  const permissions = query.data?.permissions ?? []
  const searchTerm = searchState.templateId === id ? searchState.value : ''

  const asRolePerms = React.useMemo(
    () =>
      permissions.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        description: p.description ?? '',
        assigned: p.assigned,
      })),
    [permissions],
  )

  const permissionGroups = React.useMemo(
    () => groupRolePermissions(asRolePerms, searchTerm, t('roles.otherPermissions')),
    [asRolePerms, searchTerm, t],
  )

  React.useEffect(() => {
    if (id == null || permissionGroups.length === 0) return
    if (collapsedInitForTemplateId === id) return
    setCollapsedGroups(new Set(permissionGroups.map((group) => group.key)))
    setCollapsedInitForTemplateId(id)
  }, [id, permissionGroups, collapsedInitForTemplateId])

  const allGroupsExpanded =
    collapsedInitForTemplateId === id &&
    permissionGroups.length > 0 &&
    permissionGroups.every((group) => !collapsedGroups.has(group.key))

  const toggleAllGroups = React.useCallback(() => {
    if (allGroupsExpanded) {
      setCollapsedGroups(new Set(permissionGroups.map((group) => group.key)))
    } else {
      setCollapsedGroups(new Set())
    }
  }, [allGroupsExpanded, permissionGroups])

  const setPending = (ids: number[], on: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev)
      for (const permId of ids) {
        if (on) next.add(permId)
        else next.delete(permId)
      }
      return next
    })
  }

  const toggleOne = async (permId: number, checked: boolean) => {
    if (!id || pendingIds.has(permId)) return
    const nextIds = permissions
      .filter((p) => (p.id === permId ? checked : p.assigned))
      .map((p) => p.id)
    setPending([permId], true)
    try {
      await mutation.mutateAsync({
        id,
        payload: { idsRolAccion: nextIds },
      })
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t('roleTemplates.permissionsSaveError'),
      )
    } finally {
      setPending([permId], false)
    }
  }

  const tipoLabel =
    template?.tipo === 1
      ? t('roleTemplates.typeInternal')
      : template?.tipo === 2
        ? t('roleTemplates.typeExternal')
        : null

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setSearchState({ templateId: null, value: '' })
        }
        onOpenChange(nextOpen)
      }}
    >
      <SheetContent
        side="right"
        className="flex min-h-0 w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <SheetHeader className="shrink-0 border-b border-border px-4 py-4 pr-12 text-left">
          <SheetTitle className="text-base">
            {t('roleTemplates.permissionsTitle', { name: template?.nombre ?? '' })}
          </SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-2 text-xs">
            {tipoLabel ? (
              <Badge variant="outline" className="font-normal">
                {tipoLabel}
              </Badge>
            ) : null}
            <span className="text-muted-foreground">{t('roles.autosaveHint')}</span>
            <span className="text-muted-foreground">{t('roleTemplates.syncHint')}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="shrink-0 space-y-2 border-b border-border px-4 py-3">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={searchTerm}
              className="pl-9"
              placeholder={t('roles.searchPermissions')}
              aria-label={t('roles.searchPermissions')}
              onChange={(event) => {
                setSearchState({
                  templateId: id,
                  value: event.target.value,
                })
              }}
            />
          </div>
          {permissionGroups.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 border-border/80 px-2.5 text-xs font-medium text-muted-foreground shadow-none hover:bg-muted/50 hover:text-foreground"
                onClick={toggleAllGroups}
              >
                {allGroupsExpanded ? (
                  <ChevronsDownUp className="size-3.5" aria-hidden="true" />
                ) : (
                  <ChevronsUpDown className="size-3.5" aria-hidden="true" />
                )}
                {allGroupsExpanded
                  ? t('roles.collapseAllPermissionGroups')
                  : t('roles.expandAllPermissionGroups')}
              </Button>
            </div>
          ) : null}
        </div>

        <ScrollArea className="min-h-0 flex-1 px-4">
          {query.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('roles.loadingPermissions')}
            </p>
          ) : permissions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('roles.emptyPermissions')}
            </p>
          ) : permissionGroups.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('roles.noPermissionResults')}
            </p>
          ) : (
            <TooltipProvider delayDuration={200}>
              <div className="space-y-2 py-3">
                {permissionGroups.map((group) => {
                  const isOpen =
                    collapsedInitForTemplateId === id &&
                    !collapsedGroups.has(group.key)
                  return (
                    <Collapsible
                      key={group.key}
                      open={isOpen}
                      onOpenChange={(nextOpen) => {
                        setCollapsedGroups((prev) => {
                          const next = new Set(prev)
                          if (nextOpen) next.delete(group.key)
                          else next.add(group.key)
                          return next
                        })
                      }}
                      className="overflow-hidden rounded-lg border border-border/80 bg-card/40"
                    >
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            'sticky top-0 z-10 flex w-full cursor-pointer items-center gap-2 border-b border-border/80 bg-background/95 px-2.5 py-2 text-left',
                            'hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                          )}
                          aria-label={
                            isOpen
                              ? t('roles.collapsePermissionGroup', {
                                  group: group.label,
                                })
                              : t('roles.expandPermissionGroup', {
                                  group: group.label,
                                })
                          }
                        >
                          <span
                            className={cn(
                              'flex size-5 shrink-0 items-center justify-center rounded border border-border/80 bg-muted/40 text-muted-foreground',
                            )}
                            aria-hidden="true"
                          >
                            <ChevronDown
                              className={cn(
                                'size-3.5 transition-transform duration-200',
                                isOpen ? 'rotate-0' : '-rotate-90',
                              )}
                            />
                          </span>
                          <span className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {group.label}
                          </span>
                          <Badge
                            variant="secondary"
                            className="shrink-0 px-1.5 py-0 text-[10px] font-medium tabular-nums"
                          >
                            {group.permissions.length}
                          </Badge>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <ul className="space-y-1 px-1 pb-1 pt-1">
                          {group.permissions.map((perm) => {
                            const busy = pendingIds.has(perm.id)
                            return (
                              <li
                                key={perm.id}
                                className="flex items-start gap-2 rounded-md px-2 py-2 hover:bg-muted/60"
                              >
                                <Checkbox
                                  id={`rt-perm-${perm.id}`}
                                  checked={perm.assigned}
                                  disabled={busy}
                                  className="mt-0.5"
                                  onCheckedChange={(value) => {
                                    void toggleOne(perm.id, value === true)
                                  }}
                                />
                                <div className="min-w-0 flex-1">
                                  <Label
                                    htmlFor={`rt-perm-${perm.id}`}
                                    className="text-sm font-normal leading-snug"
                                  >
                                    {perm.displayName}
                                  </Label>
                                  {perm.description ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          className="ml-1 inline-flex align-middle text-muted-foreground hover:text-foreground"
                                          aria-label={t('roles.permissionInfo')}
                                        >
                                          <Info className="size-3.5" />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs text-xs">
                                        {perm.description}
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : null}
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      </CollapsibleContent>
                    </Collapsible>
                  )
                })}
              </div>
            </TooltipProvider>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
