'use client'

import { useMemo, useState } from 'react'
import { PlusCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { AddPunchDialog } from '@/components/ttk/add-punch-dialog'
import { useFilters } from '@/lib/filter-context'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { canAddOrEditPunch } from '@/lib/auth/ttk-permissions'
import { useSrsDealers } from '@/hooks/use-srs-dealers'
import { useTranslation } from '@/lib/i18n/locale-context'

/** Sticky-header Add punch control for /issues (always visible while scrolling the table). */
export function IssuesAddPunchHeaderButton() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { selectedDealers } = useFilters()
  const { user, hasPermission, loading: meLoading } = useSrsMe()
  const { dealers } = useSrsDealers()
  const canAdd = canAddOrEditPunch(hasPermission, user?.isSystemAdmin)

  const singleDealerId = useMemo(() => {
    if (selectedDealers.length !== 1) return null
    const id = Number(selectedDealers[0])
    return Number.isFinite(id) && id > 0 ? id : null
  }, [selectedDealers])

  const singleDealerName = useMemo(() => {
    if (!singleDealerId) return undefined
    return dealers.find((d) => String(d.id) === String(singleDealerId))?.label
  }, [dealers, singleDealerId])

  if (meLoading || !canAdd) return null

  const handleClick = () => {
    if (selectedDealers.length === 0) {
      toast.error(t('dealer.selectOneInHeader'))
      return
    }
    if (selectedDealers.length > 1) {
      toast.error(t('dealer.selectOnlyOneInHeader'))
      return
    }
    if (singleDealerId == null) {
      toast.error(t('dealer.invalidSelected'))
      return
    }
    setOpen(true)
  }

  return (
    <>
      <Button
        size="sm"
        className="h-9 shrink-0 gap-1.5 cursor-pointer"
        onClick={handleClick}
      >
        <PlusCircle className="h-4 w-4" />
        <span className="hidden sm:inline">{t('punch.add')}</span>
      </Button>
      <AddPunchDialog
        open={open}
        onOpenChange={setOpen}
        idDealer={singleDealerId}
        dealerName={singleDealerName}
      />
    </>
  )
}
