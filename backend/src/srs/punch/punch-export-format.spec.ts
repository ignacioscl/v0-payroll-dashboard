import {
  buildPunchExportFilename,
  formatDurationHhMmSs,
  formatNyDate,
  formatNyStamp,
  formatNyTime,
  formatPunchMethodSuffix,
  punchExportSheetName,
} from './punch-export-format'

describe('punch-export-format', () => {
  it('formatea fechas y horas en America/New_York, no en UTC del proceso', () => {
    // 2026-07-23 17:56:00 UTC-4 (EDT) = 2026-07-23T21:56:00.000Z
    const iso = '2026-07-23T21:56:00.000Z'
    expect(formatNyDate(iso)).toBe('07/23/2026')
    expect(formatNyTime(iso)).toBe('5:56 PM')
  })

  it('una ponchada cerca de medianoche ET cambia de día respecto de UTC', () => {
    // 2026-01-15 02:30 UTC = 2026-01-14 21:30 EST
    const iso = '2026-01-15T02:30:00.000Z'
    expect(formatNyDate(iso)).toBe('01/14/2026')
    expect(formatNyTime(iso)).toBe('9:30 PM')
  })

  it('el sello de generación lleva ET', () => {
    const stamp = formatNyStamp(new Date('2026-08-26T22:47:00.000Z'))
    expect(stamp).toMatch(/^\d{2}\/\d{2}\/2026 \d{1,2}:\d{2} (AM|PM) ET$/)
  })

  it('el nombre de archivo usa guiones, no barras ni dos puntos', () => {
    const name = buildPunchExportFilename(new Date('2026-08-26T22:47:00.000Z'))
    expect(name).toBe('punch_export_08-26-2026_06-47_PM.xlsx')
    expect(name).not.toContain('/')
    expect(name).not.toContain(':')
  })

  it('duration recorta fracciones → HH:MM:SS', () => {
    expect(formatDurationHhMmSs('00:46:48.00')).toBe('00:46:48')
    expect(formatDurationHhMmSs('08:00:00')).toBe('08:00:00')
    expect(formatDurationHhMmSs(null)).toBe('')
  })

  it('finger gana a face en el sufijo', () => {
    expect(formatPunchMethodSuffix('finger', 'en')).toBe(' (Finger)')
    expect(formatPunchMethodSuffix('face', 'en')).toBe(' (Face)')
    expect(formatPunchMethodSuffix('finger', 'es')).toBe(' (Huella)')
    expect(formatPunchMethodSuffix('face', 'es')).toBe(' (Rostro)')
    expect(formatPunchMethodSuffix(null, 'en')).toBe('')
  })

  it('nombres de hoja de datos: Punch Report, Punch Report 2, …', () => {
    expect(punchExportSheetName(1, 'en')).toBe('Punch Report')
    expect(punchExportSheetName(2, 'en')).toBe('Punch Report 2')
    expect(punchExportSheetName(1, 'es')).toBe('Punch Report')
  })
})
