/* eslint-disable @typescript-eslint/no-explicit-any */
import { I18nErrorFilter } from './i18n.error.filter'
import { DB_POOL_BUSY, DB_POOL_BUSY_MESSAGE, poolBusyError } from '../../srs/srs-pool-acquire-timeout'

describe('I18nErrorFilter + pool ocupado', () => {
  it('el error DB_POOL_BUSY sale como 503 con code y message', () => {
    const logger = { setContext: jest.fn(), error: jest.fn() } as any
    const filter = new I18nErrorFilter(logger)
    const json = jest.fn()
    const status = jest.fn(() => ({ json }))
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/api/srs-kpis/kpis/billing', method: 'GET' }),
      }),
    } as any
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined)

    filter.catch(poolBusyError() as any, host)

    log.mockRestore()
    expect(status).toHaveBeenCalledWith(503)
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 503, code: DB_POOL_BUSY, message: DB_POOL_BUSY_MESSAGE }),
    )
  })
})
