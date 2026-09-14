/**
 * Eje de ESTADO del error: pendiente / corregido.
 *
 * Es un eje aparte del radio de tipos, no otro valor de esa unión: los DTO
 * transportan un solo `issueType` y los tipos del radio son mutuamente
 * excluyentes. El estado sólo se cruza con los tipos de error.
 *
 * No tiene posición `All`: los tres cards del dashboard son tres hechos
 * independientes —cuánto falta arreglar, cuánto se arregló, cuánto se borró—,
 * no una partición cuya suma tenga que dar el total.
 */
export const ERROR_STATUSES = ['pending', 'corrected'] as const
export type ErrorStatus = (typeof ERROR_STATUSES)[number]

export const DEFAULT_ERROR_STATUS: ErrorStatus = 'pending'

export function isErrorStatus(value: unknown): value is ErrorStatus {
  return value === 'pending' || value === 'corrected'
}

/**
 * El estado que REALMENTE aplica.
 *
 * Única fuente: switch, cards, mappers, grillas, chips, contador de filtros
 * activos y exports leen de acá. Sólo aplica con *Only with errors* marcada
 * (F6): sin ninguna tarjeta, o con *Manual punch*, *Without salary* o *Deleted
 * punches* —esas tarjetas no son errores—, la respuesta es `pending`, aunque el
 * switch esté en la otra posición.
 *
 * El switch NO se resetea al mover el radio: queda donde estaba y vuelve a
 * aplicar cuando el radio vuelve a `only_error`. Resetearlo haría perder la
 * selección por mirar de reojo otra tarjeta.
 */
export function effectiveErrorStatus(selectedType: string, errorStatus: ErrorStatus): ErrorStatus {
  return errorStatusCrossesType(selectedType) ? errorStatus : DEFAULT_ERROR_STATUS
}

/**
 * El único tipo del radio que se cruza con el eje de estado.
 *
 * Hasta F6 también cruzaba `all`: sin ninguna tarjeta, Corrected listaba sólo las
 * corregidas y prendía las tarjetas de tipo, un filtro que el usuario no eligió
 * y que la pantalla no explicaba.
 */
export function errorStatusCrossesType(selectedType: string): boolean {
  return selectedType === 'only_error'
}

/**
 * `issueType` que viaja al backend, ya cruzado.
 *
 * | selectedType | errorStatus | issueType   |
 * |--------------|-------------|-------------|
 * | all          | cualquiera  | all         |
 * | only_error   | pending     | only_error  |
 * | only_error   | corrected   | only_fixed  |
 * | otro         | cualquiera  | ese tipo    |
 *
 * Un solo mapper compartido: list, Grouped, detalle agrupado y los dos exports
 * pasan por acá, no por la regla repetida en cinco lugares.
 */
export function resolveIssueType(selectedType: string, errorStatus: ErrorStatus): string {
  return effectiveErrorStatus(selectedType, errorStatus) === 'corrected'
    ? 'only_fixed'
    : selectedType
}

/**
 * Fecha desde la que hay registro de correcciones (despliegue de P1). Antes de
 * eso la historia puede estar incompleta: no hubo backfill.
 *
 * No garantiza un cero: `punch_date` es la fecha del PONCHE, no la de la
 * corrección, así que una corrección hecha después puede caer en un rango
 * anterior. La condición del cartel es cobertura parcial, no inexistencia.
 */
export const CORRECTIONS_LOG_START = '2026-08-27'

export function rangeStartsBeforeCorrectionsLog(from: Date | undefined): boolean {
  if (!from) return false
  const y = from.getFullYear()
  const m = String(from.getMonth() + 1).padStart(2, '0')
  const d = String(from.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}` < CORRECTIONS_LOG_START
}
