'use client'

import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { useSrsDealers } from '@/hooks/use-srs-dealers'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { useFilters } from '@/lib/filter-context'
import { fetchRemovedDealersAvailable } from '@/lib/srs-kpis-api'

/**
 * Does the company of the session have a dealer removed with «Remove» with money in these dates?
 * Range and «Filter by completion date» go in the request and in the queryKey (G1 of
 * plans/plan-totales-income-centavos/PLAN.md §4.3). No dates = whole history.
 */
export function useRemovedDealersAvailable(
  fechaDesde: string | undefined,
  fechaHasta: string | undefined,
  filterDateDone: boolean,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['srs-kpi', 'removed-dealers-available', fechaDesde ?? '', fechaHasta ?? '', filterDateDone],
    queryFn: () => fetchRemovedDealersAvailable({ fechaDesde, fechaHasta, filterDateDone }),
    enabled,
    // While a new range loads the switch keeps its state; it goes off only when the answer is no.
    placeholderData: keepPreviousData,
  })
}

export interface RemovedDealersSwitchState {
  /** Admin General / Admin Company, «All dealers» in the combo and something to show. */
  visible: boolean
  checked: boolean
  setChecked: (value: boolean) => void
  /** What goes to the backend as includeRemovedDealers: on only while it is visible. */
  include: boolean
  /** Removed dealers whose rows show «Removed»; empty while `include` is off (§5). */
  removedIds: ReadonlySet<number>
}

const NO_IDS: ReadonlySet<number> = new Set()

/**
 * State of the «Include removed dealers» switch of one screen. It shows only for users that see
 * every dealer of their company (`isSystemAdmin`), with every dealer of the combo selected, and
 * when the endpoint says there is a removed dealer with money. When it stops showing (other range,
 * other combo, other «Filter by completion date») it goes back to off.
 */
export function useRemovedDealersSwitch({
  fechaDesde,
  fechaHasta,
  filterDateDone,
  ready,
}: {
  fechaDesde?: string
  fechaHasta?: string
  filterDateDone: boolean
  ready: boolean
}): RemovedDealersSwitchState {
  const { user } = useSrsMe()
  const { dealers } = useSrsDealers()
  const { selectedDealers } = useFilters()
  const [checked, setChecked] = useState(false)

  const allDealers = useMemo(
    () => dealers.length > 0 && dealers.every((d) => selectedDealers.includes(d.id)),
    [dealers, selectedDealers],
  )
  const canUse = ready && Boolean(user?.isSystemAdmin) && allDealers

  const query = useRemovedDealersAvailable(fechaDesde, fechaHasta, filterDateDone, canUse)
  const visible = canUse && query.data?.available === true
  const answeredNo = query.isSuccess && !query.isPlaceholderData && query.data?.available !== true

  useEffect(() => {
    if (checked && (!canUse || answeredNo)) setChecked(false)
  }, [checked, canUse, answeredNo])

  const include = visible && checked
  const removedList = query.data?.dealers
  const removedIds = useMemo(
    () => (include && removedList?.length ? new Set(removedList.map((d) => d.dealerId)) : NO_IDS),
    [include, removedList],
  )

  return { visible, checked, setChecked, include, removedIds }
}
