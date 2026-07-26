'use client'

import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Save, X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  useCreateRoleTemplate,
  useUpdateRoleTemplate,
} from '@/hooks/use-role-template-mutations'
import { useTranslation } from '@/lib/i18n/locale-context'
import {
  createRoleTemplateFormSchema,
  emptyRoleTemplateFormValues,
  roleTemplateFormValuesFromRow,
  type RoleTemplateFormValues,
} from '@/lib/roles/role-template-form-schema'
import type { RoleTemplateRow } from '@/lib/srs-role-templates-api'

export type RoleTemplateFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: RoleTemplateRow | null
}

export function RoleTemplateFormDialog({
  open,
  onOpenChange,
  template,
}: RoleTemplateFormDialogProps) {
  const { t } = useTranslation()
  const isEdit = template != null && template.id > 0
  const createMut = useCreateRoleTemplate()
  const updateMut = useUpdateRoleTemplate()
  const busy = createMut.isPending || updateMut.isPending

  const schema = React.useMemo(
    () =>
      createRoleTemplateFormSchema(
        { isEdit },
        {
          nameRequired: t('roleTemplates.nameRequired'),
          typeRequired: t('roleTemplates.typeRequired'),
          accessLevelInvalid: t('roleTemplates.accessLevelInvalid'),
        },
      ),
    [isEdit, t],
  )

  const form = useForm<RoleTemplateFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyRoleTemplateFormValues,
    mode: 'onSubmit',
  })

  React.useEffect(() => {
    if (!open) return
    form.reset(roleTemplateFormValuesFromRow(template))
  }, [open, template, form])

  const onSubmit = async (values: RoleTemplateFormValues) => {
    const pondRaw = values.ponderacion?.trim() ?? ''
    const ponderacion = pondRaw === '' ? null : Number(pondRaw)

    try {
      if (isEdit && template) {
        await updateMut.mutateAsync({
          id: template.id,
          payload: {
            nombre: values.nombre.trim(),
            ponderacion,
            estado: values.estado ? 1 : 0,
          },
        })
      } else {
        await createMut.mutateAsync({
          tipo: Number(values.tipo) as 1 | 2,
          nombre: values.nombre.trim(),
          ponderacion,
        })
      }
      toast.success(t('roleTemplates.saveSuccess'))
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('roleTemplates.saveError'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('roleTemplates.editTitle') : t('roleTemplates.addTitle')}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            {!isEdit ? (
              <FormField
                control={form.control}
                name="tipo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('roleTemplates.type')}</FormLabel>
                    <Select
                      value={field.value ?? ''}
                      onValueChange={(v) => field.onChange(v as '1' | '2')}
                      disabled={busy}
                    >
                      <FormControl>
                        <SelectTrigger className="cursor-pointer">
                          <SelectValue placeholder={t('roleTemplates.typeAll')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="1" className="cursor-pointer">
                          {t('roleTemplates.typeInternal')}
                        </SelectItem>
                        <SelectItem value="2" className="cursor-pointer">
                          {t('roleTemplates.typeExternal')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <div className="space-y-1 text-sm">
                <div className="text-muted-foreground">{t('roleTemplates.type')}</div>
                <div>
                  {template?.tipo === 1
                    ? t('roleTemplates.typeInternal')
                    : t('roleTemplates.typeExternal')}
                </div>
              </div>
            )}

            <FormField
              control={form.control}
              name="nombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="rt-nombre">{t('roleTemplates.name')}</FormLabel>
                  <FormControl>
                    <Input id="rt-nombre" maxLength={64} disabled={busy} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ponderacion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="rt-pond">{t('roleTemplates.accessLevel')}</FormLabel>
                  <FormControl>
                    <Input
                      id="rt-pond"
                      type="number"
                      min={1}
                      disabled={busy}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isEdit ? (
              <FormField
                control={form.control}
                name="estado"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                    <FormLabel htmlFor="rt-estado" className="cursor-pointer">
                      {t('roleTemplates.estado')}
                    </FormLabel>
                    <FormControl>
                      <Switch
                        id="rt-estado"
                        checked={field.value}
                        disabled={busy}
                        className="cursor-pointer"
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="cursor-pointer"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                <X className="mr-1.5 size-4" />
                {t('roleTemplates.cancel')}
              </Button>
              <Button type="submit" className="cursor-pointer" disabled={busy}>
                {busy ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <Save className="mr-1.5 size-4" />
                )}
                {busy ? t('roleTemplates.saving') : t('roleTemplates.save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
