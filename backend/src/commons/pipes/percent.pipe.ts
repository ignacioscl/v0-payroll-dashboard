import { ArgumentMetadata, HttpStatus, Injectable, PipeTransform } from '@nestjs/common'
import { DataError } from '../errors/data.error'
import { I18nError } from '../errors/i18n.error'

@Injectable()
export class PercentPipe implements PipeTransform<number, number> {
  transform(value: any, metadata: ArgumentMetadata): number {
    if (value?.percent == null || value?.percent == undefined) return value

    if (value.percent < 1 || value.percent > 100) {
      throw new I18nError('error.validation.percentFormat', HttpStatus.BAD_REQUEST)
      //throw new DataError(HttpStatus.BAD_REQUEST, 'Porcentaje debe ser entre 1 y 100.');
    }
    return value
  }
}
