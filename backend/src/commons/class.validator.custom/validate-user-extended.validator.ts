import { registerDecorator, ValidationOptions, ValidationArguments, buildMessage } from 'class-validator'

export function IsUserExtendedValid(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isUserExtendedValid',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          return true // Si no hay userExtended, es válido

          const requiredFields = ['docType', 'documentNumber', 'phone', 'registerDate']

          for (const field of requiredFields) {
            if (!value[field] || value[field] === '') {
              return false
            }
          }

          return true
        },
        defaultMessage(args: ValidationArguments) {
          const value = args.value
          if (!value) return ''

          const requiredFields = ['docType', 'documentNumber', 'phone', 'registerDate']
          const missingFields = requiredFields.filter(field => !value[field] || value[field] === '')

          if (missingFields.length === 1) {
            return `El campo '${missingFields[0]}' es requerido en userExtended`
          } else {
            return `Los campos '${missingFields.join("', '")}' son requeridos en userExtended`
          }
        },
      },
    })
  }
}
