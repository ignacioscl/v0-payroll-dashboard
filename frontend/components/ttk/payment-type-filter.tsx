'use client'

import * as React from 'react'
import { DollarSign } from 'lucide-react'
import { LookupMultiSelect } from '@/components/shared/lookup-multi-select'
import type { LookupOption } from '@/components/shared/lookup-multi-select'
import type { PaymentTypeCatalogItem, PaymentTypeFilterValue } from '@/lib/ttk/payment-type-filter'
import { paymentTypeFilterFromIds } from '@/lib/ttk/payment-type-filter'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/locale-context'

interface PaymentTypeFilterProps {
  value: PaymentTypeFilterValue
  onChange: (value: PaymentTypeFilterValue) => void
  options: PaymentTypeCatalogItem[]
  loading?: boolean
  className?: string
}

/** Sin acentos y sin mayusculas, para que "bonificacion" matchee "Bonificación". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    // Escapes, NO las marcas combinantes literales: son invisibles al leer y
    // cualquier normalizacion a NFC del archivo las alteraria sin que falle
    // ningun test, dejando la busqueda sensible a acentos en silencio.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * Payment type, seleccion multiple.
 *
 * NO tiene fila «Without payment type»: «sin tipo de pago» se pide con la
 * tarjeta *Without salary*, y los dos controles son excluyentes (D-6).
 */
export function PaymentTypeFilter({
  value,
  onChange,
  options,
  loading = false,
  className,
}: PaymentTypeFilterProps) {
  const { t } = useTranslation()
  const [search, setSearch] = React.useState('')

  // `LookupMultiSelect` monta <Command shouldFilter={false}> porque sus otros
  // usos son lookups REMOTOS. Aca el catalogo ya esta en memoria
  // (`usePaymentTypesCatalog`, staleTime 10 min), asi que el filtrado es local
  // del wrapper: sin pedido al server y sin debounce.
  const lookupOptions = React.useMemo<LookupOption[]>(() => {
    const term = normalize(search.trim())
    return options
      .filter(
        (o) =>
          term.length === 0 ||
          normalize(o.name).includes(term) ||
          normalize(o.title ?? '').includes(term),
      )
      .map((o) => ({ id: o.id, label: o.name, sublabel: o.title || undefined }))
  }, [options, search])

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <DollarSign className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="whitespace-nowrap text-[11px] text-muted-foreground">
        {t('punch.paymentTypeFilter')}
      </span>
      <LookupMultiSelect
        value={[...value.ids]}
        onChange={(ids) => onChange(paymentTypeFilterFromIds(ids))}
        options={lookupOptions}
        onSearchChange={setSearch}
        loading={loading}
        disabled={loading}
        placeholder={t('punch.allPaymentTypes')}
        // `w-auto` pisa el `w-full` del componente: el `Button` compartido trae
        // `shrink-0`, y este es el unico uso montado en un flex EN FILA. Sin esto
        // el trigger pide el 100% del padre y ya no puede achicarse, asi que se
        // desborda sobre el control vecino de la toolbar.
        className="h-7 w-auto min-w-[140px] max-w-[220px] text-[11px]"
      />
    </div>
  )
}
