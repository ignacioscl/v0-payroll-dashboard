import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { IsOptional, IsString } from 'class-validator'

import { ExtraFieldsProbePipe, extraFields } from './extra-fields-probe.pipe'

class Dto {
  @IsString()
  name!: string

  @IsOptional()
  @IsString()
  note?: string
}

describe('ExtraFieldsProbePipe (3.10, medición)', () => {
  it('nombra los campos de más, sin valores', () => {
    expect(extraFields({ name: 'a', historyMonths: 6, secret: 'x' }, { type: 'query', metatype: Dto })).toEqual([
      'historyMonths',
      'secret',
    ])
  })

  it('sin campos de más: nada; un primitivo o un @Param: nada', () => {
    expect(extraFields({ name: 'a' }, { type: 'body', metatype: Dto })).toEqual([])
    expect(extraFields('x', { type: 'param', metatype: String })).toEqual([])
  })

  it('deja una línea en el log y devuelve el valor tal cual (no rechaza)', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const value = { name: 'a', extra: 'VALOR-SECRETO' }
    const out = new ExtraFieldsProbePipe().transform(value, { type: 'body', metatype: Dto })
    expect(out).toBe(value)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toBe('extra_fields body Dto: extra')
    expect(String(warn.mock.calls[0][0])).not.toContain('VALOR-SECRETO')
    warn.mockRestore()
  })
})
