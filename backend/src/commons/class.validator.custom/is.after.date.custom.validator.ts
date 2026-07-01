import { registerDecorator, ValidationOptions, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';

@ValidatorConstraint({ async: false })
export class IsAfterDateConstraint implements ValidatorConstraintInterface {
  validate(exitDate: any, args: ValidationArguments) {
    const [relatedPropertyName] = args.constraints;
    const relatedValue = (args.object as any)[relatedPropertyName];
    if (!relatedValue || !exitDate) {
      return true; // Skip validation if either date is not provided
    }
    return new Date(exitDate) >= new Date(relatedValue);
  }

  defaultMessage(args: ValidationArguments) {
    const [relatedPropertyName] = args.constraints;
    return `$property must be after or equal to ${relatedPropertyName}`;
  }
}

export function IsAfterDateCustomValidator(property: string, validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [property],
      validator: IsAfterDateConstraint,
    });
  };
}

@ValidatorConstraint({ async: false })
export class IsBeforeDateConstraint implements ValidatorConstraintInterface {
  validate(hireDate: any, args: ValidationArguments) {
    const [relatedPropertyName] = args.constraints;
    const relatedValue = (args.object as any)[relatedPropertyName];
    if (!relatedValue || !hireDate) {
      return true; // Skip validation if either date is not provided
    }
    return new Date(hireDate) <= new Date(relatedValue);
  }

  defaultMessage(args: ValidationArguments) {
    const [relatedPropertyName] = args.constraints;
    return `$property must be before or equal to ${relatedPropertyName}`;
  }
}

export function IsBeforeDateCustomValidator(property: string, validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [property],
      validator: IsBeforeDateConstraint,
    });
  };
}
