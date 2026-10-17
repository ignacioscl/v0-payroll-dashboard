'use client'

import * as React from 'react'
import { Layers, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  RoleTemplateFilterCombobox,
  type RoleTemplateFilterOption,
} from '@/components/roles/role-template-filter-combobox'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  useAssignTemplatePreview,
  useAssignTemplateToRole,
} from '@/hooks/use-role-template-roles'
import { useTranslation } from '@/lib/i18n/locale-context'
import type { MessageKey } from '@/lib/i18n/messages'
import type { RoleListRow } from '@/lib/roles/roles-types'
import type { AssignTemplateBlocked } from '@/lib/srs-role-templates-api'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'

export type AssignTemplateDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  role: RoleListRow | null
}

const BLOCKED_KEYS: Record<AssignTemplateBlocked, MessageKey> = {
  dealer_taken: 'roles.assignTemplateDealerTaken',
  no_dealer: 'roles.assignTemplateNoDealer',
  dealer_out_of_scope: 'roles.assignTemplateDealerOutOfScope',
}

function ChangeList({
  title,
  items,
  prefix,
  className,
}: {
  title: string
  items: { id: number; nombre: string }[]
  prefix: string
  className: string
}) {
  if (items.length === 0) return null
  return (
    <section className={`rounded-md border px-2.5 py-2 ${className}`}>
      <h3 className="text-xs font-medium">
        {title} ({items.length})
      </h3>
      <ul className="mt-1 space-y-0.5 text-xs">
        {items.map((item) => (
          <li key={item.id} className="break-words leading-snug">
            <span aria-hidden>{prefix} </span>
            {item.nombre}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Assign a template to an existing role without template (one-way: the role becomes a template role). */
export function AssignTemplateDialog({ open, onOpenChange, role }: AssignTemplateDialogProps) {
  const { t } = useTranslation()
  const [template, setTemplate] = React.useState<RoleTemplateFilterOption | null>(null)
  const assign = useAssignTemplateToRole()

  React.useEffect(() => {
    if (open) setTemplate(null)
  }, [open, role])

  const tipo = role?.tipo === 1 || role?.tipo === 2 ? role.tipo : undefined
  const preview = useAssignTemplatePreview(template?.id ?? null, role?.id ?? null, open)
  const data = preview.data
  const blocked = data?.blocked ?? null
  const canConfirm = Boolean(template && data && !blocked && !preview.isFetching)

  const onConfirm = async () => {
    if (!template || !role) return
    try {
      await assign.mutateAsync({ id: template.id, idRol: role.id })
      toast.success(t('roles.assignTemplateSuccess'))
      onOpenChange(false)
    } catch (err) {
      toast.error(getSrsErrorMessage(err, t('roles.assignTemplateError')))
    }
  }

  const levelChanges = data != null && data.ponderacionBefore !== data.ponderacionAfter
  const samePermissions = data != null && data.added.length === 0 && data.removed.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('roles.assignTemplate')}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <div className="space-y-1 text-sm">
            <div className="min-w-0 break-words font-medium">{role?.nombre}</div>
            <div className="text-muted-foreground">
              {role?.tipo === 1 ? t('roles.typeInternal') : t('roles.typeExternal')}
              {role?.dealerText ? ` · ${role.dealerText}` : ''}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('roles.assignTemplateSelect')}</Label>
            <RoleTemplateFilterCombobox
              value={template}
              onChange={setTemplate}
              enabled={open}
              tipo={tipo}
              placeholder={t('roles.assignTemplateSelect')}
            />
          </div>

          {template && preview.isFetching ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
            </p>
          ) : null}

          {template && preview.isError ? (
            <p className="text-sm font-medium text-destructive">
              {getSrsErrorMessage(preview.error, t('roles.assignTemplateError'))}
            </p>
          ) : null}

          {template && data && !preview.isFetching ? (
            blocked ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {t(BLOCKED_KEYS[blocked])}
              </p>
            ) : (
              <div className="space-y-3">
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                  {t('roles.assignTemplateWarning', {
                    name: data.templateNombre,
                    newName: data.nombreAfter ?? '',
                  })}
                </p>

                <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-3">
                  <dt className="text-muted-foreground">{t('roles.assignTemplateName')}</dt>
                  <dd className="min-w-0 break-words">
                    {data.nombreBefore} → <span className="font-medium">{data.nombreAfter}</span>
                  </dd>
                  {levelChanges ? (
                    <>
                      <dt className="text-muted-foreground">{t('roles.assignTemplateAccessLevel')}</dt>
                      <dd className="tabular-nums">
                        {data.ponderacionBefore ?? '—'} →{' '}
                        <span className="font-medium">{data.ponderacionAfter ?? '—'}</span>
                      </dd>
                    </>
                  ) : null}
                </dl>

                {samePermissions ? (
                  <p className="text-sm text-muted-foreground">
                    {t('roles.assignTemplateSamePermissions')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    <ChangeList
                      title={t('roles.assignTemplateAdded')}
                      items={data.added}
                      prefix="+"
                      className="border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"
                    />
                    <ChangeList
                      title={t('roles.assignTemplateRemoved')}
                      items={data.removed}
                      prefix="−"
                      className="border-destructive/30 bg-destructive/5 text-destructive"
                    />
                  </div>
                )}
              </div>
            )
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={assign.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('roles.cancel')}
          </Button>
          <Button
            type="button"
            className="gap-1.5"
            disabled={!canConfirm || assign.isPending}
            onClick={() => void onConfirm()}
          >
            {assign.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Layers className="size-4" aria-hidden />
            )}
            {t('roles.assignTemplate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
