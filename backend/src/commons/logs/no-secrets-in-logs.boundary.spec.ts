import { readdirSync, readFileSync } from 'fs'
import { join, relative, sep } from 'path'
import * as ts from 'typescript'

/**
 * Ningún log escribe credenciales ni datos del usuario (plans/plan-buenas-practicas-v0, 2.13.2;
 * regla `.cursor/rules/nest-security-baseline.mdc`). Recorre `src/**\/*.ts` (sin specs) con el
 * parser de TypeScript y mira cada llamada a `console.*` o `*.logger.*` entera, aunque ocupe varias
 * líneas. Falla si un argumento nombra encabezados, cookies, token, contraseña, secreto o body, o si
 * pasa entero el pedido (`request`/`req`) o un usuario (`user`/`*User`). Si falla, se corrige el log.
 */
const SRC = join(__dirname, '..', '..')

/** Nombres (identificador o propiedad) que no pueden aparecer en ningún argumento. */
const SENSITIVE_NAME = /^(headers|authorization|cookies?|body|rawBody)$|(token|password|passwd|secret|authorization|cookies?)$/i
/** Identificadores que no se pueden pasar enteros. */
const WHOLE_FORBIDDEN = /^(request|req|user|[a-z]\w*User)$/

const LOG_METHODS = new Set(['log', 'error', 'warn', 'info', 'debug', 'verbose', 'fatal', 'trace'])

function isLogCall(call: ts.CallExpression): boolean {
  const callee = call.expression
  if (!ts.isPropertyAccessExpression(callee) || !LOG_METHODS.has(callee.name.text)) return false
  const target = callee.expression
  if (ts.isIdentifier(target)) return target.text === 'console' || /logger$/i.test(target.text)
  if (ts.isPropertyAccessExpression(target)) return /logger$/i.test(target.name.text)
  return false
}

function nameOf(node: ts.Node): string | undefined {
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return node.text
  return undefined
}

/** Lo que una llamada de log tiene de prohibido, o [] si nada. */
export function findSensitiveLogArgs(source: string, fileName = 'x.ts'): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const found: string[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isLogCall(node)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
      for (const arg of node.arguments) {
        const whole = ts.isIdentifier(arg) ? arg.text : undefined
        if (whole && WHOLE_FORBIDDEN.test(whole)) found.push(`${line + 1}: ${whole}`)
        const walk = (n: ts.Node): void => {
          if (ts.isStringLiteralLike(n)) return
          const name =
            nameOf(n) ??
            (ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n) ? nameOf(n.name) : undefined)
          if (name && SENSITIVE_NAME.test(name)) found.push(`${line + 1}: ${name}`)
          if (ts.isShorthandPropertyAssignment(n) && WHOLE_FORBIDDEN.test(n.name.text)) {
            found.push(`${line + 1}: ${n.name.text}`)
          }
          if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.initializer) && WHOLE_FORBIDDEN.test(n.initializer.text)) {
            found.push(`${line + 1}: ${n.initializer.text}`)
          }
          ts.forEachChild(n, walk)
        }
        walk(arg)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return [...new Set(found)]
}

function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') out.push(...tsFiles(full))
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) out.push(full)
  }
  return out
}

describe('ningún log con credenciales o datos del usuario', () => {
  it('src/ no tiene logs con encabezados, token, contraseña, body, el pedido o el usuario enteros', () => {
    const offenders = tsFiles(SRC).flatMap((file) =>
      findSensitiveLogArgs(readFileSync(file, 'utf-8'), file).map(
        (hit) => `${relative(SRC, file).split(sep).join('/')}:${hit}`,
      ),
    )
    expect(offenders).toEqual([])
  })

  it('detecta los casos prohibidos', () => {
    expect(findSensitiveLogArgs("console.log('user', user)")).toEqual(['1: user'])
    expect(findSensitiveLogArgs("this.logger.log('u', currentUser)")).toEqual(['1: currentUser'])
    expect(findSensitiveLogArgs('console.log(req)')).toEqual(['1: req'])
    expect(
      findSensitiveLogArgs(`this.logger.error('fallo', {\n  path: request.url,\n  headers: request.headers,\n})`),
    ).toEqual(['1: headers'])
    expect(findSensitiveLogArgs("console.log('t', request.headers['x-company-token'])")).toEqual(['1: headers'])
    expect(findSensitiveLogArgs("logger.warn('login', { password })")).toEqual(['1: password'])
    expect(findSensitiveLogArgs("console.log('jwt', accessToken)")).toEqual(['1: accessToken'])
    expect(findSensitiveLogArgs('console.error(dto.body)')).toEqual(['1: body'])
  })

  it('deja pasar los logs comunes', () => {
    expect(findSensitiveLogArgs("this.logger.error('I18nErrorFilter', exception)")).toEqual([])
    expect(findSensitiveLogArgs("console.log('Token expired for user id', userId)")).toEqual([])
    expect(findSensitiveLogArgs("this.logger.log(`job ${name} ok`, { ms, rows })")).toEqual([])
    expect(findSensitiveLogArgs('const headers = request.headers')).toEqual([])
  })
})
