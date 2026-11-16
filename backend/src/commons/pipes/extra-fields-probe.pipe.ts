import { ArgumentMetadata, Injectable, Logger, PipeTransform } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validateSync, ValidationError } from 'class-validator'

/**
 * Medición antes de prender `forbidNonWhitelisted` (plans/plan-buenas-practicas-v0, 3.10): mira si un body o query trae
 * campos que su DTO no declara y deja una línea `extra_fields` en el log con el DTO y los **nombres** (nunca los
 * valores). No rechaza ni cambia nada: va antes del ValidationPipe, que sigue borrando esos campos como hoy.
 * Pasos: medir dos semanas, corregir cada caso (front o DTO), prender `forbidNonWhitelisted: true` y borrar este pipe.
 */
@Injectable()
export class ExtraFieldsProbePipe implements PipeTransform {
  private readonly logger = new Logger('ExtraFieldsProbe')

  transform(value: unknown, metadata: ArgumentMetadata) {
    try {
      const fields = extraFields(value, metadata)
      if (fields.length > 0) {
        this.logger.warn(`extra_fields ${metadata.type} ${metadata.metatype?.name}: ${fields.join(', ')}`)
      }
    } catch {
      // Medir nunca rompe un pedido.
    }
    return value
  }
}

const PRIMITIVES: unknown[] = [String, Boolean, Number, Array, Object]

/** Nombres de los campos que el DTO no declara (con la ruta, si vienen de un objeto anidado). */
export function extraFields(value: unknown, metadata: ArgumentMetadata): string[] {
  const { metatype, type } = metadata
  if ((type !== 'body' && type !== 'query') || !metatype || PRIMITIVES.includes(metatype)) return []
  if (value === null || typeof value !== 'object') return []
  const errors = validateSync(plainToInstance(metatype, value) as object, {
    whitelist: true,
    forbidNonWhitelisted: true,
    skipMissingProperties: true,
  })
  return collect(errors, '')
}

function collect(errors: ValidationError[], parent: string): string[] {
  return errors.flatMap((e) => {
    const name = parent ? `${parent}.${e.property}` : e.property
    const own = e.constraints?.whitelistValidation ? [name] : []
    return [...own, ...collect(e.children ?? [], name)]
  })
}
