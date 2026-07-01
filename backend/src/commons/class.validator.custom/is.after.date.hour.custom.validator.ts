import { registerDecorator, ValidationOptions, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';
@ValidatorConstraint({ async: false })
export class IsAfterDateWithHourConstraint implements ValidatorConstraintInterface {
  validate(dateTo: any, args: ValidationArguments) {
    const [dateFromField, hourFromField, hourToField] = args.constraints;
    const dateFrom = (args.object as any)[dateFromField];
    let hourFrom = (args.object as any)[hourFromField];
    let hourTo = (args.object as any)[hourToField];

    if (!dateFrom || !dateTo) {
      return false;
    }
    if (!hourFrom) {
      hourFrom = '0000';
    }
    if (!hourTo) {
      hourTo = '0000';
    }

    const dateFromObj = new Date(`${dateFrom}T${this.parseHour(hourFrom)}`);
    const dateToObj = new Date(`${dateTo}T${this.parseHour(hourTo)}`);

    return dateToObj >= dateFromObj;
  }

  defaultMessage(args: ValidationArguments) {
    const [dateFromField, hourFromField, hourToField] = args.constraints;
    return `$property must be after or equal to ${dateFromField} ${hourFromField}`;
  }
  parseHour(hour: string | number): string {
    const hourStr = hour.toString().padStart(4, '0'); // Asegurarse de que tenga al menos 4 dígitos
    const hours = hourStr.substring(0, 2);
    const minutes = hourStr.substring(2, 4);
    return `${hours}:${minutes}`;
  }
}

// Decorator to use the IsAfterDateWithHourConstraint
export function IsAfterDateWithHour(dateFromField: string, hourFromField: string, hourToField: string, validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [dateFromField, hourFromField, hourToField],
      validator: IsAfterDateWithHourConstraint,
    });
  };
}