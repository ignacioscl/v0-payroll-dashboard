/**
 * Tiempos máximos de MySQL/MariaDB (plans/plan-buenas-practicas-v0, 2.7).
 *
 * - Conectar: 10 s, con nombre. Es el mismo valor que mysql2 usa por defecto
 *   (`connection_config.js`, `connectTimeout`): no cambia la conducta, queda explícito.
 * - Cada sentencia: lo corta la base, no el Nest. En PROD, MariaDB 10.11 con
 *   `@@global.max_statement_time = 120` (control de Ignacio, 10/11/2026); el error 1969 cae en el
 *   filtro global como error interno. La base local (MariaDB 10.3) no tiene ese límite: una
 *   consulta que en PROD corta a los 120 s, en local sigue.
 * - Nunca `SET SESSION max_statement_time` más alto ni `enableQueryTimeout` de TypeORM: el primero
 *   le sube el límite a las conexiones del Nest; el segundo solo corta del lado del cliente y la
 *   consulta sigue en la base con la conexión ocupada.
 * - La espera de una conexión libre del pool `srs` es otra cosa: `DB_POOL_ACQUIRE_TIMEOUT_MS`
 *   (`srs/srs-pool-acquire-timeout.ts`).
 */
export const DB_CONNECT_TIMEOUT_MS = 10_000
