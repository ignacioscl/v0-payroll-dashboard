import { z } from 'zod'

export type RoleTemplateFormSchemaMessages = {
  nameRequired: string
  typeRequired: string
  accessLevelInvalid: string
}

export type RoleTemplateFormSchemaContext = {
  isEdit: boolean
}

export function createRoleTemplateFormSchema(
  ctx: RoleTemplateFormSchemaContext,
  messages: RoleTemplateFormSchemaMessages,
) {
  return z
    .object({
      tipo: z.enum(['1', '2']).optional(),
      nombre: z.string().trim().min(1, messages.nameRequired).max(64),
      ponderacion: z.string().optional(),
      estado: z.boolean(),
    })
    .superRefine((data, refineCtx) => {
      if (!ctx.isEdit && data.tipo !== '1' && data.tipo !== '2') {
        refineCtx.addIssue({
          code: z.ZodIssueCode.custom,
          message: messages.typeRequired,
          path: ['tipo'],
        })
      }

      const pond = data.ponderacion?.trim() ?? ''
      if (pond !== '') {
        const n = Number(pond)
        if (!Number.isFinite(n) || n < 1) {
          refineCtx.addIssue({
            code: z.ZodIssueCode.custom,
            message: messages.accessLevelInvalid,
            path: ['ponderacion'],
          })
        }
      }
    })
}

export type RoleTemplateFormValues = z.infer<
  ReturnType<typeof createRoleTemplateFormSchema>
>

export const emptyRoleTemplateFormValues: RoleTemplateFormValues = {
  tipo: undefined,
  nombre: '',
  ponderacion: '',
  estado: true,
}

export function roleTemplateFormValuesFromRow(
  template: {
    tipo: number
    nombre: string
    ponderacion: number | null
    estado: number
  } | null,
): RoleTemplateFormValues {
  if (!template) return { ...emptyRoleTemplateFormValues }
  return {
    tipo: template.tipo === 2 ? '2' : '1',
    nombre: template.nombre ?? '',
    ponderacion:
      template.ponderacion != null && template.ponderacion > 0
        ? String(template.ponderacion)
        : '',
    estado: template.estado === 1,
  }
}
