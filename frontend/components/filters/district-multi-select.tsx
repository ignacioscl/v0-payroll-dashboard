'use client'

import * as React from 'react'

import { LookupMultiSelect } from '@/components/billing/lookup-multi-select'
import { useInvoiceDistrictLookup } from '@/hooks/use-invoice-lookups'
import { canFilterInvoiceDistrict } from '@/lib/auth/billing-permissions'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { useFilters } from '@/lib/filter-context'
import { useTranslation } from '@/lib/i18n/locale-context'

/**
 * Districts filter for the invoices header (left of the dealer combo, legacy layout).
 *
 * A district is not a query parameter: picking one narrows the dealer combo to the
 * dealers linked to it (same behaviour as legacy `districtManager.selectMultiselectDealer`).
 * Rendered only for users with ROL_ACCION 69.
 */
export function DistrictMultiSelect({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { user, hasPermission } = useSrsMe()
  const {
    selectedDistricts,
    setSelectedDistricts,
    setSelectedDealers,
    setDealerIdAllowList,
  } = useFilters()

  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')

  const canSee = canFilterInvoiceDistrict(hasPermission, user?.isSystemAdmin)
  const query = useInvoiceDistrictLookup(
    search,
    canSee && (open || selectedDistricts.length > 0),
  )

  const apply = (districtIds: number[]) => {
    const options = query.data ?? []
    setSelectedDistricts(districtIds)

    if (!districtIds.length) {
      setDealerIdAllowList(null)
      return
    }

    const selected = new Set(districtIds)
    const allow = new Set<string>()
    for (const opt of options) {
      if (!selected.has(opt.id)) continue
      for (const id of opt.dealerIds) allow.add(String(id))
    }
    const allowList = [...allow]

    setDealerIdAllowList(allowList)
    setSelectedDealers((prev) => {
      const next = prev.filter((id) => allowList.includes(id))
      return next.length > 0 ? next : allowList
    })
  }

  if (!canSee) return null

  return (
    <LookupMultiSelect
      options={query.data ?? []}
      value={selectedDistricts}
      onChange={apply}
      onSearchChange={setSearch}
      onOpenChange={setOpen}
      placeholder={t('invoices.filterDistrictPlaceholder')}
      loading={query.isFetching}
      className={className}
    />
  )
}
