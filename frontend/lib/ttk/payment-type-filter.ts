/**
 * Filtro de Payment type del Punch Report — selección múltiple.
 *
 * NO tiene «Without payment type»: «sin tipo de pago» se pide con la tarjeta
 * *Without salary* (`issueType='without_salary'`), y los dos controles son
 * EXCLUYENTES entre sí (D-6). Ver `plans/plan-ttk-grillas-punch/PLAN.md` §4.2.2bis.
 */
export type PaymentTypeFilterValue = {
  /** GENERIC_DATA.id de los tipos tildados. Vacío = todos, o sea sin filtro. */
  readonly ids: readonly number[]
}

/**
 * Nada tildado = no hay filtro de payment type.
 *
 * `Object.freeze` es superficial, así que va en los dos niveles: sin el interno
 * un `push` sobre `ids` mutaría la constante que comparte toda la pantalla.
 */
export const PAYMENT_TYPE_FILTER_ALL: PaymentTypeFilterValue = Object.freeze({
  ids: Object.freeze([] as number[]),
})

/** Tope del CSV que acepta el DTO de Nest (`@Matches`, 50 ids). */
export const PAYMENT_TYPE_IDS_MAX = 50

/** Única forma de preguntar «¿está limpio?» — la usa también el Clear de MEJORA-05. */
export function isPaymentTypeFilterAll(value: PaymentTypeFilterValue): boolean {
  return value.ids.length === 0
}

/** Construye un valor canónico: enteros positivos, sin duplicados y ordenados. */
export function paymentTypeFilterFromIds(ids: readonly number[]): PaymentTypeFilterValue {
  const clean = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0))).sort(
    (a, b) => a - b,
  )
  return Object.freeze({ ids: Object.freeze(clean) })
}

/** Tildar/destildar un id, devolviendo siempre un objeto nuevo (lo necesita el `useMemo` de params). */
export function togglePaymentType(
  value: PaymentTypeFilterValue,
  id: number,
): PaymentTypeFilterValue {
  return value.ids.includes(id)
    ? paymentTypeFilterFromIds(value.ids.filter((x) => x !== id))
    : paymentTypeFilterFromIds([...value.ids, id])
}

/**
 * Valor para el wire, espejando `errorTypesParam()`: `undefined` cuando no hay
 * que mandar el parámetro. El CSV va canónico para que la queryKey de React
 * Query no cambie por el orden en que el usuario fue tildando.
 */
export function paymentTypeFilterParams(value: PaymentTypeFilterValue): string | undefined {
  if (isPaymentTypeFilterAll(value)) return undefined
  return value.ids.join(',')
}

/** Etiqueta del chip y del Report Info: los nombres tildados, en el orden del catálogo. */
export function paymentTypeNames(
  value: PaymentTypeFilterValue,
  options: readonly PaymentTypeCatalogItem[],
): string[] {
  return options.filter((o) => value.ids.includes(o.id)).map((o) => o.name)
}

export type PaymentTypeCatalogItem = {
  id: number
  name: string
  title?: string
}

export type PaymentTypesCatalogResponse = {
  data?: PaymentTypeCatalogItem[]
  status?: string
  error?: { message?: string }
}
