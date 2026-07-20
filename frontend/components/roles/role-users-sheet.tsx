'use client'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useRoleUsers } from '@/hooks/use-role-lookups'
import { useTranslation } from '@/lib/i18n/locale-context'
import type { RoleListRow } from '@/lib/roles/roles-types'

export type RoleUsersSheetProps = {
  role: RoleListRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RoleUsersSheet({ role, open, onOpenChange }: RoleUsersSheetProps) {
  const { t } = useTranslation()
  const query = useRoleUsers(role?.id ?? null, open)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-4 py-4 pr-12 text-left">
          <SheetTitle className="text-base">
            {t('roles.usersTitle', { name: role?.nombre ?? '' })}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {t('roles.usersSubtitle')}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 px-4">
          {query.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('roles.usersLoading')}
            </p>
          ) : query.isError ? (
            <p className="py-8 text-center text-sm text-destructive">
              {query.error instanceof Error ? query.error.message : t('roles.usersError')}
            </p>
          ) : (query.data?.users.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('roles.usersEmpty')}
            </p>
          ) : (
            <ul className="space-y-2 py-4">
              {query.data!.users.map((u) => (
                <li
                  key={u.id}
                  className="rounded-md border border-border px-3 py-2 text-sm"
                >
                  <div className="font-medium">{u.nombre}</div>
                  <div className="text-xs text-muted-foreground">
                    {[u.email, u.codigoInterno].filter(Boolean).join(' · ')}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
