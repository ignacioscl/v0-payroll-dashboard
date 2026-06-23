import type { SrsSessionUser } from '@/lib/auth/types'
import type { DealerOption } from '@/components/filters/types'

export interface ContratistasJsonRow {
  id: string | number
  text: string
}

export interface ContratistasResponse {
  results?: ContratistasJsonRow[]
}

/** Same query shape as invoice_main `dealerMultiselectRestoreSessionV2`. */
export function buildContratistasQueryParams(user: SrsSessionUser): Record<string, string> {
  const dealerId = user.idDealer ?? user.idDealerProvider
  const base: Record<string, string> = { tipo_empresa: '1' }

  if (!dealerId) {
    return base
  }

  const rolesRelCount = user.rolesRelCount ?? 0
  if (user.isCompanyTypeCompany && rolesRelCount > 1) {
    return {
      ...base,
      id_dealer_v2: String(dealerId),
      version: '2',
    }
  }

  return {
    ...base,
    id_dealer_provider: String(dealerId),
    showProvidersOfUserRoles: '1',
    restrictV2: '1',
  }
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim()
}

export function mapContratistasToDealerOptions(data: ContratistasResponse): DealerOption[] {
  return (data.results ?? [])
    .filter((row) => {
      const id = String(row.id ?? '').trim()
      return id !== '' && id !== '0'
    })
    .map((row) => ({
      id: String(row.id),
      label: stripHtml(String(row.text ?? '')),
    }))
}
