/**
 * El lint marca un enlace interno con <a> (regla global «Cambiar de pantalla es instantáneo»; plans/plan-buenas-
 * practicas-v0, 3.2). Corre ESLint sobre un archivo fijo que el lint del repo ignora: si deja de marcarlo, la regla se
 * rompió.
 */
import { join } from 'node:path'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..')

describe('ESLint: enlace interno con <a>', () => {
  it('marca <a href="/billing"> como error', async () => {
    const eslint = new ESLint({ cwd: ROOT, ignore: false })
    const [result] = await eslint.lintFiles([join(ROOT, 'lib/gate/__lint__/a-interno.tsx')])
    const hits = result.messages.filter((m) => m.ruleId === 'no-restricted-syntax' && m.severity === 2)
    expect(hits).toHaveLength(1)
    expect(hits[0].message).toContain('<Link>')
  }, 60_000)
})
