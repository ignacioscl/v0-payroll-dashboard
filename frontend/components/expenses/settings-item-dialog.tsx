'use client'

import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Save, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useCreateCatalogItem, useUpdateCatalogItem } from '@/hooks/use-expenses-catalog'
import { EXPENSE_LIMITS } from '@/lib/expenses/expense-rules'
import { createSettingsItemSchema, type SettingsItemFormValues } from '@/lib/expenses/settings-form-schema'
import { useFormWithFocus } from '@/lib/forms/use-form-with-focus'
import { useTranslation } from '@/lib/i18n/locale-context'
import { isExpensesApiError, type CatalogItem, type CatalogKind } from '@/lib/srs-expenses-api'

/** Alta o edición de una categoría o compañía (F1): solo Name; Last category se muestra, no se edita (D4). */
export function SettingsItemDialog({
  kind,
  item,
  open,
  onOpenChange,
}: {
  kind: CatalogKind
  item: CatalogItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const createMut = useCreateCatalogItem(kind)
  const updateMut = useUpdateCatalogItem(kind)
  const busy = createMut.isPending || updateMut.isPending
  const isEdit = item != null

  const schema = React.useMemo(
    () => createSettingsItemSchema({ errName: t('expenses.errName'), errUpTo: t('expenses.errUpTo') }),
    [t],
  )
  const { form, handleSubmit, applyServerErrors } = useFormWithFocus<SettingsItemFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '' },
    mode: 'onSubmit',
  })

  React.useEffect(() => {
    if (open) form.reset({ name: item?.name ?? '' })
  }, [open, item, form])

  const onSubmit = async (values: SettingsItemFormValues) => {
    try {
      if (item) {
        await updateMut.mutateAsync({ id: item.id, name: values.name })
      } else {
        const created = await createMut.mutateAsync(values.name)
        // Ya había una activa con ese nombre: error. Si solo había una inactiva, el servidor la reactivó: éxito (D3).
        if (created.existing && !created.reactivated) {
          form.setError('name', { type: 'server', message: t('expenses.errNameExists') })
          return
        }
      }
      toast.success(t('expenses.toastSettingsSaved'))
      onOpenChange(false)
    } catch (err) {
      if (isExpensesApiError(err) && applyServerErrors(err.validationErrors)) return
      toast.error(err instanceof Error ? err.message : t('common.failedToLoad'))
    }
  }

  const title = isEdit
    ? kind === 'companies'
      ? t('expenses.editCompany')
      : t('expenses.editCategory')
    : kind === 'companies'
      ? t('expenses.addCompany')
      : t('expenses.addCategory')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-[calc(100%-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="settings-item-name">{t('expenses.name')}</FormLabel>
                  <FormControl>
                    <Input id="settings-item-name" maxLength={EXPENSE_LIMITS.catalogName} disabled={busy} autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isEdit && kind === 'companies' ? (
              <div className="space-y-1 text-sm">
                <div className="text-muted-foreground">{t('expenses.lastCategory')}</div>
                <div>{item?.lastCategory?.name ?? '—'}</div>
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
                <X className="size-4" />
                {t('expenses.cancel')}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {busy ? t('expenses.saving') : t('expenses.save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
