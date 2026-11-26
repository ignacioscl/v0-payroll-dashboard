import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator'

export const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Calendar date YYYY-MM-DD (rejects 2026-99-99 that a regex alone would accept). */
export function IsCalendarDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCalendarDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false
          const m = ISO_DATE.exec(value)
          if (!m) return false
          const year = Number(m[1])
          const month = Number(m[2])
          const day = Number(m[3])
          const dt = new Date(Date.UTC(year, month - 1, day))
          return (
            dt.getUTCFullYear() === year &&
            dt.getUTCMonth() === month - 1 &&
            dt.getUTCDate() === day
          )
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid YYYY-MM-DD date`
        },
      },
    })
  }
}
