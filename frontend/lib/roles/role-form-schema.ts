import { z } from 'zod'

export type RoleFormSchemaMessages = {
  nameRequired: string
  typeRequired: string
  dealerRequired: string
  accessLevelInvalid: string
}

export type RoleFormSchemaContext = {
  isEdit: boolean
  isCompanyTypeCompany: boolean
}

export function createRoleFormSchema(
  ctx: RoleFormSchemaContext,
  messages: RoleFormSchemaMessages,
) {
  return z
    .object({
      type: z.enum(['1', '2']).optional(),
      idDealer: z.string().optional(),
      idDepartment: z.string().optional(),
      role: z.string().trim().min(1, messages.nameRequired),
      ponderation: z.string().optional(),
    })
    .superRefine((data, refineCtx) => {
      if (!ctx.isEdit) {
        if (data.type !== '1' && data.type !== '2') {
          refineCtx.addIssue({
            code: z.ZodIssueCode.custom,
            message: messages.typeRequired,
            path: ['type'],
          })
        }
        if (
          data.type === '2' &&
          !ctx.isCompanyTypeCompany &&
          (!data.idDealer || data.idDealer.trim() === '')
        ) {
          refineCtx.addIssue({
            code: z.ZodIssueCode.custom,
            message: messages.dealerRequired,
            path: ['idDealer'],
          })
        }
      }

      const pond = data.ponderation?.trim() ?? ''
      if (pond !== '') {
        const n = Number(pond)
        if (!Number.isFinite(n) || n < 1) {
          refineCtx.addIssue({
            code: z.ZodIssueCode.custom,
            message: messages.accessLevelInvalid,
            path: ['ponderation'],
          })
        }
      }
    })
}

export type RoleFormValues = z.infer<ReturnType<typeof createRoleFormSchema>>

export const emptyRoleFormValues: RoleFormValues = {
  type: undefined,
  idDealer: '',
  idDepartment: '',
  role: '',
  ponderation: '',
}

export function roleFormValuesFromRow(
  role: {
    tipo: number | null
    idDealer?: number | null
    idDepartment?: number | null
    nombre: string
    ponderacion: number | null
  } | null,
): RoleFormValues {
  if (!role) return { ...emptyRoleFormValues }
  return {
    type: role.tipo != null ? (String(role.tipo) as '1' | '2') : undefined,
    idDealer: role.idDealer != null ? String(role.idDealer) : '',
    idDepartment: role.idDepartment != null ? String(role.idDepartment) : '',
    role: role.nombre ?? '',
    ponderation: role.ponderacion != null ? String(role.ponderacion) : '',
  }
}
