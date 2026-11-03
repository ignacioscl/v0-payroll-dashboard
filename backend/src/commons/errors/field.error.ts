import { HttpStatus } from '@nestjs/common'

import { DataError } from './data.error'

/**
 * Error 400 «en su campo»: el mismo cuerpo que arma main.ts para la ValidationPipe
 * (`validationErrors: [{ field, message }]`), así el form lo muestra bajo el campo y lleva el foco ahí
 * (regla global «Todo campo valida que el dato sea real»). Lo usan los facades para lo que el DTO no puede
 * decidir solo (alcance de dealers, empresa, nombre repetido, reglas de reparto).
 */
export function fieldError(field: string, message: string): DataError {
  return new DataError(HttpStatus.BAD_REQUEST, message, HttpStatus.BAD_REQUEST, undefined, [{ field, message }])
}
