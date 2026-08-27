import { BadRequestException } from '@nestjs/common'
import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator'

/** `fechaHasta` must be on or before the day before the anniversary of `fechaDesde`. */
export const PUNCH_DATE_RANGE_ERROR =
  'The date range cannot exceed one year. fechaHasta must be on or before the day before the anniversary of fechaDesde.'

export const PUNCH_DATE_ORDER_ERROR = 'fechaDesde must be on or before fechaHasta.'

const YMD = /^(\d{4})-(\d{2})-(\d{2})/

function parseYmd(raw?: string): { y: number; m: number; d: number } | null {
  if (!raw) return null
  const match = YMD.exec(raw.trim())
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  const utc = Date.UTC(y, m - 1, d)
  const check = new Date(utc)
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== m - 1 ||
    check.getUTCDate() !== d
  ) {
    return null
  }
  return { y, m, d }
}

function ymdUtc({ y, m, d }: { y: number; m: number; d: number }): number {
  return Date.UTC(y, m - 1, d)
}

function formatYmd(utcMs: number): string {
  const dt = new Date(utcMs)
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Inclusive max `fechaHasta` for D8: the calendar day before the next anniversary
 * of `fechaDesde`. Feb 29 anniversary in a non-leap year is Mar 1 (Date.UTC overflow),
 * so the max inclusive day is Feb 28.
 */
export function maxInclusiveFechaHasta(fechaDesde: string): string {
  const from = parseYmd(fechaDesde)
  if (!from) {
    throw new BadRequestException(PUNCH_DATE_ORDER_ERROR)
  }
  const anniversary = Date.UTC(from.y + 1, from.m - 1, from.d)
  return formatYmd(anniversary - 24 * 60 * 60 * 1000)
}

export function assertPunchDateRange(fechaDesde?: string, fechaHasta?: string): void {
  const from = parseYmd(fechaDesde)
  const to = parseYmd(fechaHasta)
  if (!from || !to) {
    throw new BadRequestException(PUNCH_DATE_ORDER_ERROR)
  }
  if (ymdUtc(to) < ymdUtc(from)) {
    throw new BadRequestException(PUNCH_DATE_ORDER_ERROR)
  }
  const max = maxInclusiveFechaHasta(fechaDesde!)
  const maxParsed = parseYmd(max)!
  if (ymdUtc(to) > ymdUtc(maxParsed)) {
    throw new BadRequestException(PUNCH_DATE_RANGE_ERROR)
  }
}

/** class-validator decorator for punch list / grouped / export prepare DTOs only. */
export function IsValidPunchDateRange(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidPunchDateRange',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(_value: unknown, args: ValidationArguments) {
          const obj = args.object as { fechaDesde?: string; fechaHasta?: string }
          if (!obj.fechaDesde || !obj.fechaHasta) return true
          try {
            assertPunchDateRange(obj.fechaDesde, obj.fechaHasta)
            return true
          } catch {
            return false
          }
        },
        defaultMessage(args: ValidationArguments) {
          const obj = args.object as { fechaDesde?: string; fechaHasta?: string }
          try {
            assertPunchDateRange(obj.fechaDesde, obj.fechaHasta)
          } catch (e) {
            return e instanceof Error ? e.message : PUNCH_DATE_RANGE_ERROR
          }
          return PUNCH_DATE_RANGE_ERROR
        },
      },
    })
  }
}
