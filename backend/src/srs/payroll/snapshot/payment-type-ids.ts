/**
 * Ids de tipo de pago (GENERIC_DATA, categoría 30). Única fuente en Nest: son los mismos del
 * legacy (`public/php/pojos/GenericData.php:62-114`). Entran a las queries como parámetros
 * bindeados, nunca escritos en el SQL (regla generic-data-no-hardcoded-ids).
 *
 * El tipo de una ponchada es SIEMPRE `TTK_EMPLOYEE_WORK.id_payment_type` (regla
 * ttk-payment-type-column); la copia vieja `type_payment` no se lee.
 */
export const PAYMENT_TYPE_IDS = {
  HOURLY: 1,
  PIECEWORK: 2,
  SALARY: 3,
  DAILY_RATE: 4,
  HOLIDAY: 6,
  SICKDAY: 7,
  CLOSING: 8,
  SUNDAY: 9,
  EXTRA: 10,
  SHOP: 11,
  OVERTIME_MANUAL: 12,
  FLAT_RATE: 15,
  OVERTIME_BY_HOURS: 217,
  HALF_DAY: 307,
  OTHER: 929,
  SHOP_H: 9999,
  COMMISSION: 15003,
  PIECEWORK_BY_PERCENT: 16000,
} as const

/**
 * Prorated Day cambia de id por entorno: en legacy sale de `config.ini` (`ttk_prorated_day_id`,
 * 14479 en PROD y en dev). Acá de `TTK_PRORATED_DAY_ID`. Sin la variable, ninguna ponchada se
 * trata como Prorated Day (cae en la rama por defecto: monto 0), y el job lo avisa.
 */
export function proratedDayId(): number | null {
  const raw = Number(process.env.TTK_PRORATED_DAY_ID)
  return Number.isFinite(raw) && raw > 0 ? raw : null
}

/** Tipos que pagan `hourly_rate` de la ponchada como monto fijo (DAO legacy :568-587). */
export const FIXED_AMOUNT_TYPE_IDS: readonly number[] = [
  PAYMENT_TYPE_IDS.DAILY_RATE,
  PAYMENT_TYPE_IDS.HALF_DAY,
  PAYMENT_TYPE_IDS.CLOSING,
  PAYMENT_TYPE_IDS.SUNDAY,
  PAYMENT_TYPE_IDS.SHOP,
  PAYMENT_TYPE_IDS.OVERTIME_MANUAL,
  PAYMENT_TYPE_IDS.OTHER,
]

/** Tipos de piecework (legacy `GenericData::getPieceworkPaymentTypeIdsSqlIn`). */
export const PIECEWORK_TYPE_IDS: readonly number[] = [
  PAYMENT_TYPE_IDS.PIECEWORK,
  PAYMENT_TYPE_IDS.PIECEWORK_BY_PERCENT,
]

/** Fichas cuyo pago depende de las WO (para saber si la huella mira las WO de la empresa). */
export const FLAT_RATE_AND_PIECEWORK_TYPE_IDS: readonly number[] = [
  ...PIECEWORK_TYPE_IDS,
  PAYMENT_TYPE_IDS.FLAT_RATE,
]
