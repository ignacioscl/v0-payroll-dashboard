import { epochToIso, utcEpochExpr } from './punch-list.repository'

describe('punch-list: los campos Gmt0 tienen que ser instantes reales', () => {
  it('usa UNIX_TIMESTAMP, que devuelve el UTC guardado sin depender de la sesión', () => {
    expect(utcEpochExpr('tew.punch_in')).toContain('UNIX_TIMESTAMP(tew.punch_in)')
  })

  it('no formatea la fecha como texto con una Z pegada', () => {
    expect(utcEpochExpr('tew.punch_in')).not.toContain('DATE_FORMAT')
  })

  it('anula el centinela 0000-00-00', () => {
    expect(utcEpochExpr('tew.punch_out')).toContain("tew.punch_out <= '1970-01-01'")
  })

  it('convierte el epoch al mismo instante que emite getDateGMT0() de PHP', () => {
    // punch 905753: punch_in = 2026-07-23 17:56:00, UNIX_TIMESTAMP = 1784843760.
    expect(epochToIso(1784843760)).toBe('2026-07-23T21:56:00.000Z')
    expect(epochToIso('1784843760')).toBe('2026-07-23T21:56:00.000Z')
  })

  it('devuelve null para vacío, cero y basura', () => {
    expect(epochToIso(null)).toBeNull()
    expect(epochToIso(0)).toBeNull()
    expect(epochToIso('')).toBeNull()
    expect(epochToIso('x')).toBeNull()
  })
})
