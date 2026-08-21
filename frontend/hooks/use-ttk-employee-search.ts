'use client'

import { useQuery } from '@tanstack/react-query'
import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import { SrsPhpPath } from '@/types/enum-url'

export type TtkEmployeeOption = {
  id: number
  nombre: string
  role?: string
  department?: string
  thumbnailUuid?: string | null
  logoImg?: string | null
}

type TtkEmployeesResponse = {
  data?: { results: TtkEmployeeOption[] }
  status?: string
  error?: { message?: string }
}

/**
 * `idDealer` acepta un id o un CSV de ids. Vacío/null busca en toda la compañía
 * del usuario logueado (el backend siempre filtra por ella).
 *
 * El requisito de tener dealer NO vive acá: cada consumidor lo expresa en `enabled`.
 */
export function useTtkEmployeeSearch(
  term: string,
  idDealer: number | string | null,
  enabled: boolean,
) {
  const apiRequest = useSrsApiRequest<undefined, { term: string; id_dealer: string }, TtkEmployeesResponse>(
    SrsPhpPath.TTK_EMPLOYEES,
  )

  const idDealerParam = idDealer == null ? '' : String(idDealer)

  return useQuery({
    queryKey: ['ttk-employees', idDealerParam, term],
    queryFn: async () => {
      const raw = await apiRequest.getCustom('', undefined, {
        term,
        id_dealer: idDealerParam,
      })
      const data = assertSrsSuccess<{ results: TtkEmployeeOption[] }>(
        raw,
        'Failed to search employees',
      )
      return data.results ?? []
    },
    enabled: enabled && term.trim().length >= 2,
    staleTime: 30_000,
  })
}
