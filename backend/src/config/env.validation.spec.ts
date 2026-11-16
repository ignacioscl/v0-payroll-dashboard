/**
 * Configuración validada al arrancar (plans/plan-buenas-practicas-v0, 3.7).
 */
import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'dotenv'
import { Logger } from '@nestjs/common'

import { validateEnv } from './env.validation'

const OK = {
  PORT: '3020',
  DB_HOST: '127.0.0.1',
  DB_PORT: '3306',
  DB_USERNAME: 'u',
  DB_PASSWORD: 'p',
  DB_DATABASE: 'srssui5_srs',
  JWT_SECRET: 'x'.repeat(40),
}

describe('validateEnv', () => {
  it('con lo obligatorio pasa', () => {
    expect(() => validateEnv(OK)).not.toThrow()
  })

  it('sin JWT_SECRET tira un error que lo nombra', () => {
    const { JWT_SECRET: _omit, ...rest } = OK
    expect(() => validateEnv(rest)).toThrow(/JWT_SECRET/)
  })

  it('DB_PORT=abc tira error', () => {
    expect(() => validateEnv({ ...OK, DB_PORT: 'abc' })).toThrow(/DB_PORT/)
  })

  it('en producción un JWT_SECRET corto avisa en el log y arranca igual (la clave de PROD no se cambia); en dev no avisa', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    try {
      expect(() => validateEnv({ ...OK, NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(9) })).not.toThrow()
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0][0]).toMatch(/JWT_SECRET/)
      warn.mockClear()
      validateEnv({ ...OK, NODE_ENV: 'production' })
      validateEnv({ ...OK, NODE_ENV: 'development', JWT_SECRET: 'corto' })
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('en producción sin JWT_SECRET sigue sin arrancar', () => {
    const { JWT_SECRET: _omit, ...rest } = OK
    expect(() => validateEnv({ ...rest, NODE_ENV: 'production' })).toThrow(/JWT_SECRET/)
  })

  it('los dos ejemplos de variables pasan (con valores de relleno en los secretos)', () => {
    for (const file of ['.env.template', 'srs-backend.env.example']) {
      const env = parse(readFileSync(join(__dirname, '..', '..', file)))
      // Los «PEGAR_…» del ejemplo de PROD se completan como lo haría Ignacio.
      const filled = Object.fromEntries(
        Object.entries(env).map(([k, v]) => [k, v.startsWith('PEGAR') ? (k.endsWith('_URL') ? 'https://main.srssuite.com' : 'valor') : v]),
      )
      expect(() => validateEnv({ ...filled, DB_PASSWORD: filled.DB_PASSWORD || 'p', JWT_SECRET: 'x'.repeat(40) })).not.toThrow()
    }
  })
})
