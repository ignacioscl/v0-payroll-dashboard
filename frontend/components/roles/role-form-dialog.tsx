'use client'

import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useSrsDealers } from '@/hooks/use-srs-dealers'
import { useRoleDepartments } from '@/hooks/use-role-lookups'
import { useSaveRole } from '@/hooks/use-role-mutations'
import { useCreateRolesFromTemplate } from '@/hooks/use-role-template-roles'
import { canManageRoleTemplates } from '@/lib/auth/roles-permissions'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { useTranslation } from '@/lib/i18n/locale-context'
import {
  createRoleFormSchema,
  emptyRoleFormValues,
  roleFormValuesFromRow,
  type RoleFormValues,
} from '@/lib/roles/role-form-schema'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import type { RoleListRow } from '@/lib/roles/roles-types'

export type RoleFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  role: RoleListRow | null
  isCompanyTypeCompany: boolean
  loggedDealerId: number | null
}

export function RoleFormDialog({
  open,
  onOpenChange,
  role,
  isCompanyTypeCompany,
  loggedDealerId,
}: RoleFormDialogProps) {
  const { t } = useTranslation()
  const { hasPermission, user } = useSrsMe()
  const canUseTemplates = canManageRoleTemplates(hasPermission, user?.isSystemAdmin)
  const isEdit = role != null && role.id > 0
  const save = useSaveRole()
  const createFromTemplate = useCreateRolesFromTemplate()
  const { dealers } = useSrsDealers()

  const [fromTemplate, setFromTemplate] = React.useState(false)
  const [template, setTemplate] = React.useState<RoleTemplateFilterOption | null>(null)
  const [templateError, setTemplateError] = React.useState<string | null>(null)

  const schema = React.useMemo(
    () =>
      createRoleFormSchema(
        { isEdit, isCompanyTypeCompany },
        {
          nameRequired: t('roles.nameRequired'),
          typeRequired: t('roles.typeRequired'),
          dealerRequired: t('roles.dealerRequired'),
          accessLevelInvalid: t('roles.accessLevelInvalid'),
        },
      ),
    [isEdit, isCompanyTypeCompany, t],
  )

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyRoleFormValues,
    mode: 'onSubmit',
  })

  const type = form.watch('type')
  const idDealer = form.watch('idDealer')

  React.useEffect(() => {
    if (!open) return
    form.reset(roleFormValuesFromRow(role))
    setFromTemplate(false)
    setTemplate(null)
    setTemplateError(null)
  }, [open, role, form])

  const showDealer =
    !isEdit &&
    (fromTemplate
      ? template?.tipo === 2
      : isCompanyTypeCompany || type === '2' || type === '1')

  const dealerIdForDpto = React.useMemo(() => {
    if (isCompanyTypeCompany) {
      return loggedDealerId && loggedDealerId > 0 ? loggedDealerId : null
    }
    const selected = idDealer ? Number(idDealer) : 0
    if (selected > 0) return selected
    return loggedDealerId && loggedDealerId > 0 ? loggedDealerId : null
  }, [isCompanyTypeCompany, loggedDealerId, idDealer])

  const providerForDpto = React.useMemo(() => {
    if (isCompanyTypeCompany) {
      const selected = idDealer ? Number(idDealer) : 0
      return selected > 0 ? selected : null
    }
    return loggedDealerId && loggedDealerId > 0 ? loggedDealerId : null
  }, [isCompanyTypeCompany, idDealer, loggedDealerId])

  const dptos = useRoleDepartments(
    dealerIdForDpto,
    providerForDpto,
    open && !fromTemplate && dealerIdForDpto != null,
  )

  const busy = save.isPending || createFromTemplate.isPending

  const createFromSelectedTemplate = async (values: RoleFormValues) => {
    if (!template || template.id < 1) {
      setTemplateError(t('roles.templateRequired'))
      return
    }
    if (template.tipo === 2) {
      const dealerId = values.idDealer ? Number(values.idDealer) : 0
      if (dealerId < 1) {
        form.setError('idDealer', { message: t('roles.dealerRequired') })
        return
      }
    }
    try {
      await createFromTemplate.mutateAsync({
        id: template.id,
        payload:
          template.tipo === 2 ? { idDealers: [Number(values.idDealer)] } : {},
      })
      toast.success(t('roles.saveSuccess'))
      onOpenChange(false)
    } catch (err) {
      toast.error(getSrsErrorMessage(err, t('roles.saveError')))
    }
  }

  const onSubmit = async (values: RoleFormValues) => {
    try {
      await save.mutateAsync({
        id_rol: isEdit ? role!.id : undefined,
        type: isEdit ? undefined : Number(values.type),
        id_dealer: values.idDealer ? Number(values.idDealer) : null,
        id_department: values.idDepartment ? Number(values.idDepartment) : null,
        role: values.role.trim(),
        ponderation: values.ponderation?.trim()
          ? Number(values.ponderation)
          : null,
      })
      toast.success(t('roles.saveSuccess'))
      onOpenChange(false)
    } catch (err) {
      toast.error(getSrsErrorMessage(err, t('roles.saveError')))
    }
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isEdit && fromTemplate) {
      void createFromSelectedTemplate(form.getValues())
      return
    }
    void form.handleSubmit(onSubmit)(e)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('roles.editRole') : t('roles.addRole')}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4" onSubmit={handleFormSubmit}>
            {!isEdit ? (
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {t('roles.addFromTemplateHint')}
              </p>
            ) : null}

            {!isEdit && canUseTemplates ? (
              <div className="space-y-3">
                <div className="flex flex-row items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                  <Label htmlFor="role-from-template" className="cursor-pointer">
                    {t('roles.basedOnTemplate')}
                  </Label>
                  <Switch
                    id="role-from-template"
                    checked={fromTemplate}
                    disabled={busy}
                    className="cursor-pointer"
                    onCheckedChange={(checked) => {
                      setFromTemplate(checked)
                      setTemplate(null)
                      setTemplateError(null)
                      form.clearErrors()
                      if (checked) {
                        form.setValue('type', undefined)
                        form.setValue('role', '')
                        form.setValue('ponderation', '')
                        form.setValue('idDepartment', '')
                        form.setValue('idDealer', '')
                      }
                    }}
                  />
                </div>

                {fromTemplate ? (
                  <div className="space-y-2">
                    <Label>{t('roles.basedOnFilter')}</Label>
                    <RoleTemplateFilterCombobox
                      value={template}
                      onChange={(next) => {
                        setTemplate(next)
                        setTemplateError(null)
                        form.setValue('idDealer', '')
                        form.clearErrors('idDealer')
                      }}
                      enabled={open && fromTemplate}
                      placeholder={t('roles.selectTemplate')}
                    />
                    {templateError ? (
                      <p className="text-sm font-medium text-destructive">{templateError}</p>
                    ) : null}
                    {template ? (
                      <p className="text-xs text-muted-foreground">
                        {template.tipo === 1
                          ? t('roles.typeInternal')
                          : t('roles.typeExternal')}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {!isEdit && !fromTemplate ? (
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('roles.type')}</FormLabel>
                    <Select
                      value={field.value ?? ''}
                      onValueChange={(v) => {
                        field.onChange(v as '1' | '2')
                        form.setValue('idDealer', '')
                        form.setValue('idDepartment', '')
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('roles.typeAll')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="1">{t('roles.typeInternal')}</SelectItem>
                        <SelectItem value="2">{t('roles.typeExternal')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            {isEdit ? (
              <div className="space-y-1 text-sm">
                <div className="text-muted-foreground">{t('roles.type')}</div>
                <div>
                  {role?.tipo === 1
                    ? t('roles.typeInternal')
                    : role?.tipo === 2
                      ? t('roles.typeExternal')
                      : role?.tipoTxt}
                </div>
                <div className="pt-2 text-muted-foreground">{t('roles.colCompany')}</div>
                <div>{role?.companyTxt}</div>
                <div className="pt-2 text-muted-foreground">{t('roles.colDealer')}</div>
                <div>{role?.dealerText}</div>
              </div>
            ) : null}

            {showDealer ? (
              <FormField
                control={form.control}
                name="idDealer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('roles.colDealer')}</FormLabel>
                    <Select
                      value={field.value || undefined}
                      onValueChange={(v) => {
                        field.onChange(v)
                        form.setValue('idDepartment', '')
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('roles.selectDealer')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {dealers.map((d) => (
                          <SelectItem key={d.id} value={String(d.id)}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            {!fromTemplate ? (
              <>
                <FormField
                  control={form.control}
                  name="idDepartment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('roles.colDepartment')}</FormLabel>
                      <Select
                        value={field.value || 'none'}
                        onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}
                        disabled={!dealerIdForDpto}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('roles.selectDepartment')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">{t('roles.departmentAll')}</SelectItem>
                          {(dptos.data ?? []).map((d) => (
                            <SelectItem key={d.id} value={String(d.id)}>
                              {d.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="role-name">{t('roles.colName')}</FormLabel>
                      <FormControl>
                        <Input id="role-name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="ponderation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="role-pond">{t('roles.accessLevel')}</FormLabel>
                      <FormControl>
                        <Input id="role-pond" type="number" min={1} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                {t('roles.cancel')}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? t('roles.saving') : t('roles.save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
