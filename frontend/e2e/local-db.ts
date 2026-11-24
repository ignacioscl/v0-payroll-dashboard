/**
 * La copia local de la base (MariaDB del contenedor `srs-mariadb`, base `srssui5_srs_20261112`), para los e2e que tienen
 * que leer lo que la pantalla escribió o **dejar todo como estaba** al terminar (plans/plan-wo-to-be-billed-v0, T11:
 * «Los e2e no dejan datos»). Nunca otra base: el nombre está fijo y la conexión es la del contenedor local.
 *
 * Solo para valores que arma la prueba (ids y textos propios); los textos pasan por `sqlText`.
 */
import { execFileSync } from 'node:child_process'

export const LOCAL_DB = process.env.E2E_LOCAL_DB ?? 'srssui5_srs_20261112'
const CONTAINER = process.env.E2E_DB_CONTAINER ?? 'srs-mariadb'

function run(sql: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'sh', '-c', `mysql -u root -p"$MYSQL_ROOT_PASSWORD" -N -B --default-character-set=utf8mb4 ${LOCAL_DB}`],
    { input: sql, timeout: 60_000 },
  ).toString()
}

/** ¿Está el contenedor con la copia? Si no, los e2e que la necesitan se saltean con este motivo. */
export function localDbMissing(): string | null {
  try {
    const out = run('SELECT DATABASE();').trim()
    return out === LOCAL_DB ? null : `The local copy ${LOCAL_DB} is not the current database of ${CONTAINER}`
  } catch {
    return `No ${CONTAINER} container with the local copy ${LOCAL_DB}`
  }
}

/** Filas como objetos (`NULL` → null); todo llega como texto. */
export function query(sql: string, columns: string[]): Array<Record<string, string | null>> {
  return run(sql)
    .split('\n')
    .filter((l) => l.length > 0)
    .map((line) => {
      const cells = line.split('\t')
      return Object.fromEntries(columns.map((c, i) => [c, cells[i] === 'NULL' ? null : (cells[i] ?? null)]))
    })
}

/** Un solo valor (la primera columna de la primera fila). */
export function scalar(sql: string): string | null {
  return query(sql, ['v'])[0]?.v ?? null
}

/** Sentencias que escriben (cada una termina en `;`). */
export function exec(sql: string): void {
  run(sql)
}

/** Un texto entre comillas para SQL (o NULL). */
export function sqlText(value: string | null): string {
  if (value == null) return 'NULL'
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`
}

export function ids(values: number[]): string {
  if (!values.length) return 'NULL'
  if (!values.every((v) => Number.isInteger(v))) throw new Error('ids must be integers')
  return values.join(',')
}
