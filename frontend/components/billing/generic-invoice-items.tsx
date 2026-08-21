'use client'

import * as React from 'react'
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { SearchableCombobox } from '@/components/shared/searchable-combobox'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useDeleteCatalogItem, useGenericCatalog } from '@/hooks/use-generic-invoice'
import {
  centsToPesos,
  dividirYRedondear,
  lineCents,
} from '@/lib/billing/generic-invoice-money'
import { useTranslation } from '@/lib/i18n/locale-context'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import type { GenericCatalogItem } from '@/lib/srs-generic-invoices-api'

export type GenericFreeDraft = {
  kind: 'free'
  key: string
  idRel?: number
  description: string
  qty: number | null
  unitAmount: number
  isPaid?: boolean
}

export type GenericTtkDraft = {
  kind: 'ttk'
  key: string
  idRels?: number[]
  idEmployee: number
  nombreEmployee: string
  rolName: string | null
  dptoName: string | null
  hoursReg: number
  amountDealer: number
  onlyTimecard: boolean
  isPaid?: boolean
}

export type GenericItemDraft = GenericFreeDraft | GenericTtkDraft

/** Bare figure, no currency symbol — the ledger columns. */
export function fmtNum(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return n < 0 ? `-${abs}` : abs
}

/** Currency figure — reserved for the grand total. */
export function fmtMoney(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return n < 0 ? `-$${abs}` : `$${abs}`
}

export function lineDisplayTotal(item: GenericItemDraft): number {
  return centsToPesos(dividirYRedondear(lineCents(item), 100))
}

const EYEBROW =
  'text-[10.5px] font-semibold uppercase tracking-[0.085em] text-muted-foreground leading-none'

function parseOptionalQty(raw: string): { ok: true; value: number | null } | { ok: false } {
  const trimmed = raw.trim()
  if (trimmed === '') return { ok: true, value: null }
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0.01 || n > 9999999.99) return { ok: false }
  return { ok: true, value: Math.round(n * 100) / 100 }
}

function parseUnitAmount(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < -999999.99 || n > 999999.99) return null
  return Math.round(n * 100) / 100
}

function toCustomCatalogItem(term: string): GenericCatalogItem {
  return { id: 0, name: term, price: null, canDelete: false }
}

function itemLabel(item: GenericItemDraft): string {
  return item.kind === 'ttk' ? item.nombreEmployee : item.description
}

export function GenericInvoiceItems({
  items,
  onChange,
  idDealer,
  canDeleteCatalogItem,
  disabled = false,
  onDraftDirtyChange,
  toolbarExtra,
  unbilledHoursByEmployee,
}: {
  items: GenericItemDraft[]
  onChange: (items: GenericItemDraft[]) => void
  idDealer: number | null
  canDeleteCatalogItem: boolean
  disabled?: boolean
  onDraftDirtyChange?: (dirty: boolean) => void
  toolbarExtra?: React.ReactNode
  unbilledHoursByEmployee?: Record<number, number>
}) {
  const { t } = useTranslation()
  const [descItem, setDescItem] = React.useState<GenericCatalogItem | null>(null)
  const [descTerm, setDescTerm] = React.useState('')
  const [debouncedDesc, setDebouncedDesc] = React.useState('')
  const [qty, setQty] = React.useState('')
  const [unitAmount, setUnitAmount] = React.useState('')
  const [pendingRemove, setPendingRemove] = React.useState<GenericItemDraft | null>(null)
  const [pendingCatalog, setPendingCatalog] = React.useState<GenericCatalogItem | null>(null)
  const draftSeq = React.useRef(1)

  const catalog = useGenericCatalog(36, idDealer, debouncedDesc)
  const deleteCatalog = useDeleteCatalogItem()

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebouncedDesc(descTerm.trim()), 250)
    return () => window.clearTimeout(id)
  }, [descTerm])

  React.useEffect(() => {
    const dirty =
      Boolean(descItem?.name?.trim()) ||
      descTerm.trim() !== '' ||
      qty.trim() !== '' ||
      unitAmount.trim() !== ''
    onDraftDirtyChange?.(dirty)
  }, [descItem, descTerm, qty, unitAmount, onDraftDirtyChange])

  const resetDraft = () => {
    setDescItem(null)
    setDescTerm('')
    setQty('')
    setUnitAmount('')
  }

  const fillFromCatalog = (item: GenericCatalogItem | null) => {
    setDescItem(item)
    if (item?.price != null) setUnitAmount(String(item.price))
  }

  const nextFreeKey = () => {
    const n = draftSeq.current
    draftSeq.current += 1
    return `free:draft:${n}`
  }

  const addItem = () => {
    const description = (descItem?.name ?? descTerm).trim()
    if (!description) {
      toast.error(t('invoices.generic.descriptionRequired'))
      return
    }
    if (description.length > 128) {
      toast.error(t('invoices.generic.descriptionTooLong'))
      return
    }
    const parsedQty = parseOptionalQty(qty)
    if (!parsedQty.ok) {
      toast.error(t('invoices.generic.qtyInvalid'))
      return
    }
    const amount = parseUnitAmount(unitAmount)
    if (amount === null) {
      toast.error(t('invoices.generic.amountRequired'))
      return
    }
    const dup = items.some(
      (row) =>
        row.kind === 'free' && row.description.trim().toLowerCase() === description.toLowerCase(),
    )
    if (dup) {
      toast.error(t('invoices.generic.duplicateItem'))
      return
    }
    onChange([
      ...items,
      {
        kind: 'free',
        key: nextFreeKey(),
        description,
        qty: parsedQty.value,
        unitAmount: amount,
      },
    ])
    resetDraft()
  }

  const beginEdit = (row: GenericFreeDraft) => {
    if (row.isPaid) return
    const currentDescription = (descItem?.name ?? descTerm).trim()
    let nextItems = items.filter((item) => item.key !== row.key)
    if (currentDescription) {
      const parsedQty = parseOptionalQty(qty)
      const amount = parseUnitAmount(unitAmount)
      const exists = nextItems.some(
        (item) =>
          item.kind === 'free' &&
          item.description.trim().toLowerCase() === currentDescription.toLowerCase(),
      )
      if (parsedQty.ok && amount !== null && !exists) {
        nextItems = [
          ...nextItems,
          {
            kind: 'free',
            key: nextFreeKey(),
            description: currentDescription,
            qty: parsedQty.value,
            unitAmount: amount,
          },
        ]
      } else {
        toast.warning(t('invoices.generic.draftDiscarded'))
      }
    }
    onChange(nextItems)
    setDescItem(toCustomCatalogItem(row.description))
    setDescTerm('')
    setQty(row.qty == null ? '' : String(row.qty))
    setUnitAmount(String(row.unitAmount))
  }

  const onDraftKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    addItem()
  }

  return (
    <>
      <div className="sticky top-0 z-10 grid gap-3 border-y border-border bg-muted px-6 py-4 md:grid-cols-[minmax(0,1fr)_7rem_8rem_auto] md:items-end">
        <div className="space-y-1.5">
          <Label className={EYEBROW}>{t('invoices.generic.description')}</Label>
          <SearchableCombobox<GenericCatalogItem>
            value={descItem}
            onChange={fillFromCatalog}
            searchTerm={descTerm}
            onSearchTermChange={setDescTerm}
            items={catalog.data ?? []}
            isLoading={catalog.isFetching}
            getItemKey={(item) => (item.id > 0 ? item.id : `custom:${item.name}`)}
            getItemLabel={(item) => item.name}
            minSearchChars={0}
            serverSideSearch
            disabled={disabled}
            className="h-9 rounded-md bg-card py-0"
            placeholder={t('invoices.generic.descriptionPlaceholder')}
            searchPlaceholder={t('invoices.generic.descriptionPlaceholder')}
            emptyTitle={t('invoices.generic.catalogEmpty')}
            createCustomItem={toCustomCatalogItem}
            createItemLabel={(term) => t('invoices.generic.useCustom', { term })}
            onDeleteItem={
              canDeleteCatalogItem ? (item) => setPendingCatalog(item) : undefined
            }
            canDeleteItem={(item) => item.canDelete && item.id > 0}
            deleteItemAriaLabel={t('invoices.generic.deleteCatalogAction')}
            prerequisite={{
              met: idDealer != null && idDealer > 0,
              title: t('invoices.generic.dealer'),
              description: t('invoices.generic.pickDealerFirst'),
            }}
            renderItem={({ item }) => (
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {item.name}
                {item.price != null ? ` (${fmtMoney(item.price)})` : ''}
              </span>
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="generic-item-qty" className={EYEBROW}>
            {t('invoices.generic.qty')}
          </Label>
          <Input
            id="generic-item-qty"
            type="number"
            min={0.01}
            step="0.01"
            value={qty}
            disabled={disabled}
            className="bg-card text-right font-mono tabular-nums"
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={onDraftKeyDown}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="generic-item-amount" className={EYEBROW}>
            {t('invoices.generic.unitAmount')}
          </Label>
          <Input
            id="generic-item-amount"
            type="number"
            min={-999999.99}
            max={999999.99}
            step="0.01"
            value={unitAmount}
            disabled={disabled}
            className="bg-card text-right font-mono tabular-nums"
            onChange={(e) => setUnitAmount(e.target.value)}
            onKeyDown={onDraftKeyDown}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {toolbarExtra}
          <Button type="button" disabled={disabled} onClick={addItem}>
            <Plus />
            {t('invoices.generic.addItem')}
          </Button>
        </div>
      </div>

      <div className="px-6">
        {items.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm font-semibold text-foreground/80">
              {t('invoices.generic.itemsEmptyTitle')}
            </p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
              {t('invoices.generic.itemsEmptyBody')}
            </p>
          </div>
        ) : (
          <Table className="table-fixed">
            <colgroup>
              <col />
              <col className="w-[108px]" />
              <col className="w-[92px]" />
              <col className="w-[128px]" />
              <col className="w-[132px]" />
              <col className="w-[76px]" />
            </colgroup>
            <TableHeader>
              <TableRow className="hover:bg-transparent [&>th]:border-b [&>th]:border-primary">
                <TableHead className={`${EYEBROW} h-auto px-0 pt-3 pb-2`}>
                  {t('invoices.generic.colItem')}
                </TableHead>
                <TableHead className={`${EYEBROW} h-auto px-0 pt-3 pb-2 text-right`}>
                  {t('invoices.generic.colRate')}
                </TableHead>
                <TableHead className={`${EYEBROW} h-auto px-0 pt-3 pb-2 text-right`}>
                  {t('invoices.generic.colQty')}
                </TableHead>
                <TableHead className={`${EYEBROW} h-auto px-0 pt-3 pb-2 text-right`}>
                  {t('invoices.generic.colAmount')}
                </TableHead>
                <TableHead className={`${EYEBROW} h-auto px-0 pt-3 pb-2`}>
                  {t('invoices.generic.onlyTimecard')}
                </TableHead>
                <TableHead className="h-auto px-0 pt-3 pb-2" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const paid = Boolean(item.isPaid)
                const unbilled =
                  item.kind === 'ttk' && !paid
                    ? Number(unbilledHoursByEmployee?.[item.idEmployee] ?? 0)
                    : 0
                return (
                  <TableRow key={item.key} className="group hover:bg-transparent">
                    <TableCell className="py-2.5 pr-5 pl-0 font-medium">
                      {item.kind === 'ttk' ? (
                        <div>
                          <div className="truncate">{item.nombreEmployee}</div>
                          <div className="text-xs font-normal text-muted-foreground">
                            {[item.rolName, item.dptoName].filter(Boolean).join(' / ') || '—'}
                          </div>
                          {unbilled > 0 ? (
                            <p className="mt-1 text-xs font-normal text-amber-700 dark:text-amber-400">
                              {t('invoices.generic.hoursUnbilledBanner', {
                                hours: fmtNum(unbilled),
                              })}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="truncate">{item.description}</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 pr-0 pl-3 text-right font-mono text-[13.5px] tabular-nums">
                      {item.kind === 'ttk' ? (
                        <span className="text-muted-foreground/50">—</span>
                      ) : (
                        fmtNum(item.unitAmount)
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 pr-0 pl-3 text-right font-mono text-[13.5px] tabular-nums">
                      {item.kind === 'ttk' ? (
                        fmtNum(item.hoursReg)
                      ) : item.qty == null ? (
                        <span className="text-muted-foreground/50">—</span>
                      ) : (
                        item.qty
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 pr-0 pl-3 text-right font-mono text-[13.5px] font-medium tabular-nums">
                      {fmtNum(lineDisplayTotal(item))}
                    </TableCell>
                    <TableCell className="py-2.5 pr-0 pl-3">
                      {item.kind === 'ttk' ? (
                        <Checkbox
                          className="cursor-pointer"
                          checked={item.onlyTimecard}
                          disabled={disabled || paid || Boolean(item.idRels?.length)}
                          onCheckedChange={(value) => {
                            if (paid || item.idRels?.length) return
                            onChange(
                              items.map((row) =>
                                row.key === item.key && row.kind === 'ttk'
                                  ? { ...row, onlyTimecard: value === true }
                                  : row,
                              ),
                            )
                          }}
                          aria-label={t('invoices.generic.onlyTimecard')}
                        />
                      ) : null}
                    </TableCell>
                    <TableCell className="py-2.5 pr-0 pl-3">
                      {paid ? (
                        <div className="flex justify-end text-muted-foreground">
                          <Lock className="size-3.5" aria-label={t('invoices.generic.paidLocked')} />
                        </div>
                      ) : (
                        <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                          {item.kind === 'free' ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              disabled={disabled}
                              aria-label={t('invoices.generic.edit')}
                              onClick={() => beginEdit(item)}
                            >
                              <Pencil />
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={disabled}
                            aria-label={t('invoices.generic.remove')}
                            className="hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setPendingRemove(item)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <ConfirmActionDialog
        open={pendingRemove != null}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null)
        }}
        tone="danger"
        title={t('invoices.generic.removeConfirmTitle')}
        description={t('invoices.generic.removeConfirm', {
          name: pendingRemove ? itemLabel(pendingRemove) : '',
        })}
        cancelLabel={t('common.cancel')}
        confirmLabel={t('invoices.generic.remove')}
        onConfirm={() => {
          if (pendingRemove) {
            onChange(items.filter((item) => item.key !== pendingRemove.key))
          }
          setPendingRemove(null)
        }}
      />

      <ConfirmActionDialog
        open={pendingCatalog != null}
        onOpenChange={(open) => {
          if (!open && !deleteCatalog.isPending) setPendingCatalog(null)
        }}
        tone="danger"
        title={t('invoices.generic.deleteCatalogTitle')}
        description={t('invoices.generic.deleteCatalogConfirm', {
          name: pendingCatalog?.name ?? '',
        })}
        cancelLabel={t('common.cancel')}
        confirmLabel={t('invoices.generic.deleteCatalogAction')}
        pending={deleteCatalog.isPending}
        pendingLabel={t('common.loading')}
        onConfirm={async () => {
          if (!pendingCatalog) return
          try {
            await deleteCatalog.mutateAsync(pendingCatalog.id)
            toast.success(t('invoices.generic.deleteCatalogSuccess'))
            if (descItem?.id === pendingCatalog.id) {
              setDescItem(null)
              setDescTerm('')
            }
            setPendingCatalog(null)
          } catch (err) {
            toast.error(getSrsErrorMessage(err, t('invoices.generic.deleteCatalogError')))
          }
        }}
      />
    </>
  )
}
