import { readFileSync } from 'fs'
import { join } from 'path'

import { dataSourceOptions } from '../typeorm.config'

/**
 * Todo arranque compila sobre un `dist` vacío (plans/plan-buenas-practicas-v0, etapa 1).
 *
 * TypeORM busca las entidades con un glob sobre `dist` (typeorm.config.ts: `**\/*.entity.js`). Un `.entity.js` que quedó
 * compilado de un módulo borrado se sigue cargando: el 12/11/2026, al sacar la plantilla, `dist` guardaba las entidades
 * de user, role, company y audit-log, y el Nest local no arrancaba («DataSource with name "default" has already
 * added» en cada reintento). `nest start --watch` con `incremental` no borra lo viejo; por eso start y debug vacían
 * `dist` antes, como ya hacía build. Va dentro del script y no en un `prestart`: pnpm no corre los `pre*` y a veces
 * se arranca con `pnpm start`.
 */
const scripts: Record<string, string> = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'))
  .scripts

describe('dist vacío antes de compilar', () => {
  it('las entidades se cargan por glob sobre la carpeta compilada', () => {
    expect(JSON.stringify(dataSourceOptions.entities)).toContain('*.entity{.ts,.js}')
  })

  it.each(['start', 'debug'])('%s vacía dist antes de compilar, con npm y con pnpm', (script) => {
    expect(scripts[script]).toMatch(/^rimraf dist && /)
    expect(scripts[`pre${script}`]).toBeUndefined()
  })

  it('build vacía dist antes (prebuild: el Dockerfile corre npm run build)', () => {
    expect(scripts.prebuild).toBe('rimraf dist')
  })
})
