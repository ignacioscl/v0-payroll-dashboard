import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, relative } from 'path'
import * as ts from 'typescript'

/**
 * `npm run create-feature` (plans/plan-buenas-practicas-v0, cambio 1.2): genera un feature a una carpeta temporal y
 * lo compila con el compilador de TypeScript. Falla si el molde importa algo que no existe (como pasó cuando se borró
 * la autenticación de la plantilla) o si arma mal sus propios imports. Nunca escribe en src/: el app.module que
 * edita es una copia temporal.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { generateFeature } = require('./runner') as {
  generateFeature: (o: { feature: string; properties?: string[]; featuresDir: string; appModuleFile: string | null }) => string
}

const BACKEND = join(__dirname, '..', '..')
const SRC = join(BACKEND, 'src')
const FEATURE = 'zz-codegen-probe'
const FILES = [
  `${FEATURE}.module.ts`,
  `entity/${FEATURE}.entity.ts`,
  `repository/${FEATURE}.repository.ts`,
  `service/${FEATURE}.service.ts`,
  `dto/${FEATURE}.dto.ts`,
  `controller/${FEATURE}.controller.ts`,
]

/** Opciones del tsconfig del backend, sin emitir: `src/...` resuelve por baseUrl, como en el resto del Nest. */
function compilerOptions(): ts.CompilerOptions {
  const configPath = join(BACKEND, 'tsconfig.json')
  const { config } = ts.readConfigFile(configPath, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, BACKEND, undefined, configPath)
  return { ...parsed.options, noEmit: true, incremental: false, declaration: false }
}

function diagnosticsOf(files: string[]): string[] {
  const program = ts.createProgram(files, compilerOptions())
  return ts
    .getPreEmitDiagnostics(program)
    .map((d) => {
      const where = d.file ? `${d.file.fileName}:${d.file.getLineAndCharacterOfPosition(d.start ?? 0).line + 1} ` : ''
      return `${where}${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`
    })
}

describe('generador create-feature', () => {
  let tmp: string
  let featuresDir: string
  let appModuleCopy: string
  let featureDir: string

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'srs-codegen-'))
    // Los paquetes se resuelven subiendo carpetas: la temporal ve los node_modules del backend por un enlace.
    symlinkSync(join(BACKEND, 'node_modules'), join(tmp, 'node_modules'), 'junction')
    featuresDir = join(tmp, 'features')
    mkdirSync(featuresDir)
    appModuleCopy = join(tmp, 'app.module.ts')
    writeFileSync(appModuleCopy, readFileSync(join(SRC, 'app.module.ts'), 'utf8'))
    featureDir = generateFeature({
      feature: FEATURE,
      properties: ['name:string', 'amount:number', 'active:boolean'],
      featuresDir,
      appModuleFile: appModuleCopy,
    })
  })

  afterAll(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  it('escribe en la carpeta pedida y no en src/', () => {
    expect(relative(tmp, featureDir).startsWith('..')).toBe(false)
    expect(existsSync(join(SRC, 'features', FEATURE))).toBe(false)
    for (const f of FILES) expect(existsSync(join(featureDir, f))).toBe(true)
  })

  it('lo generado compila: ningún import roto ni tipo mal', () => {
    const errors = diagnosticsOf(FILES.map((f) => join(featureDir, f)))
    expect(errors).toEqual([])
  }, 120000)

  it('el controlador usa la auth de PRO (SrsJwtGuard en /srs/<nombre>) y nada de la plantilla borrada', () => {
    const controller = readFileSync(join(featureDir, `controller/${FEATURE}.controller.ts`), 'utf8')
    expect(controller).toContain('@UseGuards(SrsJwtGuard)')
    expect(controller).toContain(`@Controller('/srs/${FEATURE}')`)
    expect(controller).toContain('srsContext: SrsContext')
    expect(controller).not.toMatch(/Roles|JwtAuthGuard|RequestWithUser|features\/auth/)
    const mod = readFileSync(join(featureDir, `${FEATURE}.module.ts`), 'utf8')
    expect(mod).toContain('SrsAuthModule')
  })

  it('el entity trae las propiedades pedidas con su validador', () => {
    const entity = readFileSync(join(featureDir, `entity/${FEATURE}.entity.ts`), 'utf8')
    expect(entity).toMatch(/@IsString\(\)\s+@Column\(\)\s+name: string/)
    expect(entity).toMatch(/@IsNumber\(\)\s+@Column\(\)\s+amount: number/)
    expect(entity).toMatch(/@IsBoolean\(\)\s+@Column\(\)\s+active: boolean/)
    expect(entity).not.toContain('propP@ram')
  })

  it('suma el módulo en las marcas de app.module (la copia) y las deja para el próximo', () => {
    const app = readFileSync(appModuleCopy, 'utf8')
    expect(app).toContain(`import { ZzCodegenProbeModule } from './features/${FEATURE}/${FEATURE}.module'\n//ImportTemplateModule`)
    expect(app).toContain('ZzCodegenProbeModule,\n    //TemplateModule')
    expect(readFileSync(join(SRC, 'app.module.ts'), 'utf8')).not.toContain('ZzCodegenProbe')
  })

  it('rechaza un feature que ya existe, un nombre inválido y una propiedad sin tipo conocido', () => {
    expect(() => generateFeature({ feature: FEATURE, featuresDir, appModuleFile: null })).toThrow(/Ya existe/)
    expect(() => generateFeature({ feature: 'Mal Nombre', featuresDir, appModuleFile: null })).toThrow(/Nombre inválido/)
    expect(() => generateFeature({ feature: 'zz-otro', properties: ['x:date'], featuresDir, appModuleFile: null })).toThrow(
      /Propiedad inválida/,
    )
    expect(existsSync(join(featuresDir, 'zz-otro'))).toBe(false) // no deja un feature a medias
  })
})
