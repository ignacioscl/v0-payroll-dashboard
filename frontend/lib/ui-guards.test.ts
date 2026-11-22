/**
 * Controles de los componentes comunes y los estilos (plans/plan-buenas-practicas-v0, etapa 5). Leen el código
 * fuente:
 * - 5.1: todo buscador es `SearchInput` (el único `type="search"`) o `CommandInput` (el único `CommandPrimitive.Input`),
 *   los dos con la X. Así ningún buscador nuevo sale sin X.
 * - 5.2: ninguna pantalla decide el pin de una columna por el ancho; el `DataTable` no fija nada debajo de 768 px.
 * - 5.3: todo campo de contraseña es `PasswordInput`, con el ojo adentro.
 * - 5.6: todo CSS propio en una capa, sin `styles/globals.css`, y los z-index de la pantalla como tokens.
 * - T8: un solo proveedor de tooltips, en `components/app-providers.tsx`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

const sources = ['app', 'components', 'lib', 'hooks']
  .flatMap((d) => walk(path.join(ROOT, d)))
  .map((f) => ({ file: path.relative(ROOT, f), src: fs.readFileSync(f, 'utf8') }))

const uiSources = sources.filter(({ file }) => file.startsWith('app/') || file.startsWith('components/'))

function filesMatching(re: RegExp, list = sources): string[] {
  return list.filter(({ src }) => re.test(src)).map(({ file }) => file)
}

describe('buscadores (5.1)', () => {
  it('type="search" solo en components/shared/search-input.tsx', () => {
    expect(filesMatching(/type=["']search["']/)).toEqual(['components/shared/search-input.tsx'])
  })

  it('CommandPrimitive.Input solo en components/ui/command.tsx', () => {
    expect(filesMatching(/CommandPrimitive\.Input\b/)).toEqual(['components/ui/command.tsx'])
  })
})

describe('tablas en celular (5.2)', () => {
  it('ninguna pantalla decide el pin por el ancho', () => {
    expect(filesMatching(/pin:\s*isMobile|isMobile\s*\?\s*\{\s*left:\s*\[/)).toEqual([])
  })

  it('el DataTable suelta las columnas fijas en celular', () => {
    const src = sources.find(({ file }) => file === 'components/shared/data-table/data-table.tsx')!.src
    expect(src).toMatch(/columnPinning:\s*isMobile\s*\?\s*NO_PINNING\s*:/)
    expect(src).toMatch(/MOBILE_WRAP_CELL/)
  })
})

describe('contraseñas (5.3)', () => {
  it('type="password" solo en components/shared/password-input.tsx', () => {
    const offenders = filesMatching(/type=["']password["']|type=\{['"]password['"]\}/).filter(
      (file) => file !== 'components/shared/password-input.tsx',
    )
    expect(offenders).toEqual([])
    const own = sources.find(({ file }) => file === 'components/shared/password-input.tsx')!.src
    expect(own).toMatch(/type=\{visible \? 'text' : 'password'\}/)
  })
})

describe('estilos (5.6)', () => {
  const css = fs.readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8')

  it('no existe styles/globals.css', () => {
    expect(fs.existsSync(path.join(ROOT, 'styles/globals.css'))).toBe(false)
  })

  it('app/globals.css no tiene reglas fuera de capa (salvo :root, .dark, @theme, @import, @custom-variant)', () => {
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const outside: string[] = []
    let depth = 0
    let buffer = ''
    for (const ch of noComments) {
      if (ch === '{') {
        if (depth === 0) {
          const selector = buffer.trim()
          if (!/^(:root|\.dark|@theme\b|@layer\b|@custom-variant\b)/.test(selector)) outside.push(selector)
        }
        depth++
        buffer = ''
      } else if (ch === '}') {
        depth--
        buffer = ''
      } else if (ch === ';' && depth === 0) {
        buffer = ''
      } else {
        buffer += ch
      }
    }
    expect(outside).toEqual([])
  })

  it('la manito va en la capa base', () => {
    expect(css).toMatch(/@layer base[\s\S]*button:not\(:disabled, \[aria-disabled='true'\]\)[\s\S]*cursor: pointer/)
  })

  it('los z-index de la pantalla son tokens (z-(--z-…)), no números sueltos', () => {
    // Pilas propias de un componente que no son capas de la pantalla (las celdas fijas del DataTable).
    const LOCAL_STACKS = new Set(['components/shared/data-table/data-table.tsx'])
    const numbered = filesMatching(/(?<![\w-])z-(20|30|40|50|60)(?![\w-])/, uiSources)
    const arbitrary = filesMatching(/(?<![\w-])z-\[/, uiSources).filter((f) => !LOCAL_STACKS.has(f))
    expect({ numbered, arbitrary }).toEqual({ numbered: [], arbitrary: [] })
    for (const token of ['--z-sticky', '--z-header', '--z-sidebar', '--z-overlay', '--z-alert']) {
      expect(css).toContain(`${token}:`)
    }
  })
})

describe('tooltips (T8)', () => {
  it('<TooltipProvider> solo en components/app-providers.tsx', () => {
    expect(filesMatching(/<TooltipProvider\b/)).toEqual(['components/app-providers.tsx'])
  })
})

describe('combos de empleados y de dos opciones (Ignacio, 22/11)', () => {
  it('todo combo de empleados es EmployeeCombobox (con la foto)', () => {
    expect(filesMatching(/SearchableCombobox<\s*\w*(Employee|Vendor|Usuario)\w*/, uiSources)).toEqual([
      'components/ttk/employee-combobox.tsx',
    ])
  })

  it('ningún combo nuevo de dos opciones fijas: van en tarjetas o en un switch', () => {
    // Ya estaban: tarea `ui-dos-opciones-a-tarjetas` (PLAN-GENERAL). Al tocar una, pasa a tarjetas y sale de acá.
    const pending = [
      'components/billing/invoice-po-ro-dialog.tsx',
      'components/expenses/recurring-rule-form.tsx',
      'components/roles/role-form-dialog.tsx',
      'components/roles/templates/role-template-form-dialog.tsx',
    ]
    const twoOptions = uiSources
      .filter(({ src }) =>
        [...src.matchAll(/<SelectContent[\s\S]*?<\/SelectContent>/g)].some(
          (m) => (m[0].match(/<SelectItem\b/g) ?? []).length === 2 && !m[0].includes('.map('),
        ),
      )
      .map(({ file }) => file)
      .sort()
    expect(twoOptions).toEqual(pending)
  })
})
