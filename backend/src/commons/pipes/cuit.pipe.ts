import { ArgumentMetadata, HttpStatus, Injectable, PipeTransform } from '@nestjs/common'
import { DataError } from '../errors/data.error'
import { I18nError } from '../errors/i18n.error'

@Injectable()
export class CuitPipe implements PipeTransform<number, number> {
  transform(value: any, metadata: ArgumentMetadata): number {
    if (value?.tipoDocu != 10) return value

    //Si es igual a 10, es CUIT. Validamos
    if (value.docNumber == null || value.docNumber == undefined) {
      throw new I18nError('error.validation.cuil', HttpStatus.BAD_REQUEST)
      //throw new DataError(HttpStatus.BAD_REQUEST, 'CUIT Inválido');
    } else if (value.docNumber.length != 13) {
      throw new I18nError('error.validation.cuil', HttpStatus.BAD_REQUEST)
      //throw new DataError(HttpStatus.BAD_REQUEST, 'CUIT Inválido2')
    } else {
      const cuit = value.docNumber

      let cuitFix = cuit.replace(/-/g, '')
      let acumulado = 0
      let digitos = cuitFix.split('')
      let digito = parseInt(digitos.pop())

      for (let i = 0; i < digitos.length; i++) {
        acumulado += digitos[9 - i] * (2 + (i % 6))
      }

      let verif = 11 - (acumulado % 11)
      if (verif === 11) {
        verif = 0
      } else if (verif === 10) {
        verif = 9
      }

      if (verif != digito) {
        throw new I18nError('error.validation.cuil', HttpStatus.BAD_REQUEST)
        //throw new DataError(HttpStatus.BAD_REQUEST, 'CUIT Inválido3')
      }
    }
    return value
  }
}
