import { ValueTransformer } from 'typeorm'

/**
 * Columnas DATETIME en UTC escritas como texto `YYYY-MM-DD HH:MM:SS` (los tiempos de los jobs y
 * `fecha_calculo` del snapshot). Sin esto TypeORM arma un `Date` leyendo el texto en la hora LOCAL
 * del proceso y el driver lo guarda en UTC: en una Mac en UTC−3 quedaba +3 h. Acá el texto se lee
 * como UTC. Al leer, la conexión usa `dateStrings` y el texto vuelve tal cual (UTC).
 */
export const utcDateTimeTransformer: ValueTransformer = {
  to(value: unknown) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
      return new Date(`${value.replace(' ', 'T')}Z`)
    }
    return value
  },
  from(value: unknown) {
    // Al hidratar una entidad, TypeORM ya convirtió el texto de la base en un `Date` leyéndolo en la
    // hora local: con los getters locales se recupera el texto original (UTC).
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const p = (n: number) => String(n).padStart(2, '0')
      return (
        `${value.getFullYear()}-${p(value.getMonth() + 1)}-${p(value.getDate())} ` +
        `${p(value.getHours())}:${p(value.getMinutes())}:${p(value.getSeconds())}`
      )
    }
    return value
  },
}
