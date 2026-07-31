'use client'

import { useInfiniteQuery } from '@tanstack/react-query'

import { fetchPunchList, type PunchListResponse } from '@/lib/srs-kpis-api'
import type { PunchListCursor, PunchListQueryParams } from '@/lib/ttk/punch-list-filters'
import type { TtkListRow } from '@/lib/ttk/ttk-list-types'

type PunchListInfiniteArgs = {
  queryKey: readonly unknown[]
  enabled: boolean
  params: Omit<PunchListQueryParams, 'afterValue' | 'afterId'>
  staleTime?: number
}

/**
 * Scroll infinito por CURSOR (keyset) para el listado de ponchadas.
 *
 * A diferencia del paginado por offset, el `pageParam` no es un número de página
 * sino el cursor de la última fila entregada. Por eso las ponchadas que entran
 * arriba mientras el usuario scrollea no corren la ventana: cada pedido dice
 * "dame las que siguen a ESTA", no "salteá N posiciones".
 *
 * `getNextPageParam` devuelve el `nextCursor` que armó el backend — el front no
 * necesita saber por qué columna se está ordenando ni cómo formatear la fecha.
 */
export function usePunchListInfinite({
  queryKey,
  enabled,
  params,
  staleTime = 2 * 60 * 1000,
}: PunchListInfiniteArgs) {
  const query = useInfiniteQuery<PunchListResponse, Error, unknown, readonly unknown[], PunchListCursor | null>({
    queryKey,
    enabled,
    staleTime,
    initialPageParam: null,
    queryFn: async ({ pageParam }) =>
      fetchPunchList({
        ...params,
        afterValue: pageParam?.value,
        afterId: pageParam?.id,
      }),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
  })

  const pages = (query.data as { pages?: PunchListResponse[] } | undefined)?.pages ?? []

  /**
   * Dedupe por id — red de seguridad.
   *
   * El cursor ya evita el solape, pero si alguna vez volviera a colarse una fila
   * repetida, dos filas con el mismo `getRowId` producen keys duplicadas en React:
   * la tabla pinta una fila muchas veces y descarta otras. Filtrar acá hace que
   * ese modo de falla sea imposible.
   */
  const rows: TtkListRow[] = []
  const seen = new Set<string>()
  for (const page of pages) {
    for (const row of page.results ?? []) {
      const id = String(row.id)
      if (seen.has(id)) continue
      seen.add(id)
      rows.push(row)
    }
  }

  return {
    rows,
    total: pages[0]?.total ?? 0,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    error: query.error,
  }
}
