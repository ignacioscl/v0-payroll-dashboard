import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, relative, sep } from 'path'
import Handlebars from 'handlebars'

import { EmailRequestError } from './email.types'

/** En dist: dist/commons/email/templates (lo copia `compilerOptions.assets` de nest-cli.json). En jest: el fuente. */
export const EMAIL_TEMPLATES_DIR = join(__dirname, 'templates')

const PARTIALS_DIR = 'partials'
/** Ruta relativa sin extensión ('test', 'jobs/alert'); sin `..` ni mayúsculas. */
const TEMPLATE_NAME_RE = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/

interface CompiledTemplate {
  html: HandlebarsTemplateDelegate
  text: HandlebarsTemplateDelegate
}

/**
 * Plantillas del módulo (plans/plan-nest-email §8.6). Cada una es una pareja `nombre.hbs` (HTML,
 * envuelto en el layout: `{{#> layout title=subject}} … {{/layout}}`) + `nombre.txt.hbs` (texto
 * plano, sin escape HTML). `partials/**` se registran como partials (`layout`). Instancia propia de
 * Handlebars (no la global). En dev vacía la caché en cada render: editar un `.hbs` se ve sin
 * reiniciar (`--watchAssets` lo copia a dist).
 */
export class EmailTemplateRenderer {
  private hb = Handlebars.create()
  private readonly cache = new Map<string, CompiledTemplate>()
  private partialsLoaded = false

  constructor(private readonly dir: string, private readonly reloadOnEachRender: boolean) {}

  /** Tira EmailRequestError si la plantilla no existe, no tiene su `.txt.hbs` o no renderiza. */
  render(name: string, context: Record<string, unknown>): { html: string; text: string } {
    if (this.reloadOnEachRender) this.reset()
    const tpl = this.compiled(name)
    try {
      return { html: tpl.html(context), text: tpl.text(context) }
    } catch (e) {
      throw new EmailRequestError(`email template '${name}' failed to render: ${(e as Error).message}`)
    }
  }

  /** Nombres de todas las plantillas del directorio (sin partials ni `.txt.hbs`). */
  names(): string[] {
    return listHbs(this.dir)
      .filter((rel) => !rel.endsWith('.txt.hbs') && !rel.startsWith(`${PARTIALS_DIR}/`))
      .map((rel) => rel.slice(0, -'.hbs'.length))
      .sort()
  }

  /** Compila y renderiza (contexto vacío) todas las plantillas. No tira: devuelve las rotas. */
  precompileAll(): Array<{ name: string; error: string }> {
    this.reset()
    const broken: Array<{ name: string; error: string }> = []
    for (const name of this.names()) {
      try {
        const tpl = this.compiled(name)
        tpl.html({})
        tpl.text({})
      } catch (e) {
        broken.push({ name, error: (e as Error).message })
      }
    }
    return broken
  }

  private reset(): void {
    this.cache.clear()
    this.hb = Handlebars.create()
    this.partialsLoaded = false
  }

  private compiled(name: string): CompiledTemplate {
    if (!TEMPLATE_NAME_RE.test(name) || name.startsWith(`${PARTIALS_DIR}/`)) {
      throw new EmailRequestError(`invalid email template name '${name}'`)
    }
    const cached = this.cache.get(name)
    if (cached) return cached
    if (!this.partialsLoaded) this.loadPartials()

    const htmlPath = join(this.dir, `${name}.hbs`)
    const textPath = join(this.dir, `${name}.txt.hbs`)
    if (!existsSync(htmlPath)) throw new EmailRequestError(`email template '${name}' not found`)
    if (!existsSync(textPath)) {
      throw new EmailRequestError(`email template '${name}' has no ${name}.txt.hbs (plain text is mandatory)`)
    }
    const tpl: CompiledTemplate = {
      html: this.hb.compile(readFileSync(htmlPath, 'utf-8')),
      text: this.hb.compile(readFileSync(textPath, 'utf-8'), { noEscape: true }),
    }
    this.cache.set(name, tpl)
    return tpl
  }

  private loadPartials(): void {
    const dir = join(this.dir, PARTIALS_DIR)
    for (const rel of listHbs(dir)) {
      this.hb.registerPartial(rel.slice(0, -'.hbs'.length), readFileSync(join(dir, rel), 'utf-8'))
    }
    this.partialsLoaded = true
  }
}

/** Rutas relativas (con `/`) de todos los `.hbs` debajo de `dir`; vacío si no existe. */
function listHbs(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && entry.name.endsWith('.hbs')) out.push(relative(dir, full).split(sep).join('/'))
    }
  }
  walk(dir)
  return out
}
