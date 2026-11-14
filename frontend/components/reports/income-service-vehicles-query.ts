'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchIncomeServiceVehicles } from '@/lib/srs-kpis-api'

/** One service of the open dealer row, with the numbers of its row (plans/plan-income-by-dealer-ttk-y-autos T5). */
export type ServiceVehiclesTarget = {
  dealerId: number
  dealer: string
  service: string
  /** The range of that year, as the backend cropped it. */
  fechaDesde: string
  fechaHasta: string
  filterDateDone: boolean
  qty: number
  vehicles: number
  income: number
}

/**
 * The vehicles of one service: the open row and «View in a window» use the same key, so opening the window of a service
 * already open in the row does not ask again, also after the global one-minute staleTime (CODE-review M1). Without «Include removed dealers», like the services of the row (a removed
 * dealer is still found by its id).
 */
export function useServiceVehicles(target: ServiceVehiclesTarget | null) {
  return useQuery({
    queryKey: [
      'srs-kpi',
      'income-service-vehicles',
      target
        ? {
            fechaDesde: target.fechaDesde,
            fechaHasta: target.fechaHasta,
            idDealer: target.dealerId,
            filterDateDone: target.filterDateDone,
            service: target.service,
          }
        : null,
    ],
    queryFn: () =>
      fetchIncomeServiceVehicles({
        fechaDesde: target!.fechaDesde,
        fechaHasta: target!.fechaHasta,
        idDealer: String(target!.dealerId),
        filterDateDone: target!.filterDateDone,
        service: target!.service,
      }),
    enabled: target != null,
    // §5.2: con los mismos filtros se reusa (abrir la ventana de un servicio ya abierto en la fila no vuelve a pedir,
    // aunque haya pasado más de un minuto, el staleTime global). Cambiar un filtro cambia la clave y sí pide.
    staleTime: Infinity,
  })
}
