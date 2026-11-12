/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * `npm run create-feature <nombre> [prop:string|number|boolean ...]`
 *
 * Arma `src/features/<nombre>/` con la estructura de la regla `nest-feature-one-resource.mdc` (module, entity,
 * repository, service, dto, controller) a partir de `template/`, y lo suma a `app.module.ts` en las marcas
 * `//ImportTemplateModule` y `//TemplateModule`. El controlador sale con `SrsJwtGuard` en `/srs/<nombre>`
 * (regla `typeorm-crud-no-raw-sql.mdc`).
 *
 * Lo prueba `code-generator.spec.ts`: genera a una carpeta temporal y compila lo generado con el compilador de
 * TypeScript; falla si el molde importa algo que no existe.
 */
const fs = require('fs-extra')
const path = require('path')
const upperCamelCase = require('uppercamelcase')

const TEMPLATE_DIR = path.join(__dirname, 'template')
const SRC_DIR = path.join(__dirname, '..')
const TYPES = ['entity', 'repository', 'dto', 'service', 'controller', 'module']
const IMPORT_MARK = '//ImportTemplateModule'
const MODULE_MARK = '//TemplateModule'

const PROPERTY_BY_TYPE = {
  string: { validator: 'IsString', tsType: 'string', swaggerType: 'String' },
  number: { validator: 'IsNumber', tsType: 'number', swaggerType: 'Number' },
  boolean: { validator: 'IsBoolean', tsType: 'boolean', swaggerType: 'Boolean' },
}

const replaceAll = (string, search, replace) => string.split(search).join(replace)

const parseProperty = (property) => {
  const [name, type] = property.split(':')
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name ?? '') || !PROPERTY_BY_TYPE[type]) {
    throw new Error(`Propiedad inválida «${property}»: se escribe nombre:string|number|boolean`)
  }
  return [name, type]
}

/** Propiedades `nombre:tipo` del entity (sin ninguna, una `dummy:string` para que el feature compile). */
const makeUpEntity = (fileStr, properties) => {
  const props = properties.length ? properties : ['dummy:string']
  const validators = new Set()
  const columns = props.map((property) => {
    const [name, type] = parseProperty(property)
    const spec = PROPERTY_BY_TYPE[type]
    validators.add(spec.validator)
    return `  @ApiProperty({
    description: 'Property ${name}',
    type: ${spec.swaggerType},
  })
  @${spec.validator}()
  @Column()
  ${name}: ${spec.tsType}`
  })
  const imports = `import { ApiProperty } from '@nestjs/swagger'\nimport { ${[...validators].sort().join(', ')} } from 'class-validator'\n`
  return imports + fileStr.replace('  //propP@ram', columns.join('\n\n'))
}

/** `../entity/template` → `../entity/<nombre>.entity`, igual con dto, service, controller y repository. */
const makeUpImports = (fileStr, featureName) =>
  fileStr.replace(/\b(entity|dto|service|controller|repository)\/template(['"])/g, `$1/${featureName}.$1$2`)

const makeUpFile = (destDir, featureName, type, properties) => {
  const actualName = type === 'module' ? path.join(destDir, 'template.module.ts') : path.join(destDir, type, 'template.ts')
  const newName =
    type === 'module' ? path.join(destDir, `${featureName}.module.ts`) : path.join(destDir, type, `${featureName}.${type}.ts`)
  fs.renameSync(actualName, newName)

  let fileStr = replaceAll(fs.readFileSync(newName, 'utf8'), 'Template', upperCamelCase(featureName))
  fileStr = makeUpImports(fileStr, featureName)
  if (type === 'entity') fileStr = makeUpEntity(fileStr, properties)
  else if (type === 'controller') fileStr = replaceAll(fileStr, `'/srs/template'`, `'/srs/${featureName}'`)
  fs.writeFileSync(newName, fileStr, 'utf8')
}

const addToAppModule = (appModuleFile, featureName) => {
  const data = fs.readFileSync(appModuleFile, 'utf8')
  if (!data.includes(IMPORT_MARK) || !data.includes(MODULE_MARK)) {
    throw new Error(`${appModuleFile} no tiene las marcas ${IMPORT_MARK} y ${MODULE_MARK}`)
  }
  const className = upperCamelCase(`${featureName}Module`)
  let fileStr = replaceAll(data, MODULE_MARK, `${className},\n    ${MODULE_MARK}`)
  fileStr = replaceAll(
    fileStr,
    IMPORT_MARK,
    `import { ${className} } from './features/${featureName}/${featureName}.module'\n${IMPORT_MARK}`,
  )
  fs.writeFileSync(appModuleFile, fileStr, 'utf8')
}

/**
 * Genera el feature. `featuresDir` y `appModuleFile` existen para que el test escriba en una carpeta temporal;
 * con `appModuleFile: null` no toca ningún app.module.
 */
const generateFeature = ({
  feature,
  properties = [],
  featuresDir = path.join(SRC_DIR, 'features'),
  appModuleFile = path.join(SRC_DIR, 'app.module.ts'),
}) => {
  if (!/^[a-z][a-z0-9.-]*$/.test(feature ?? '')) {
    throw new Error(`Nombre inválido «${feature}»: minúsculas, números, «-» o «.» (ej. srs-foo)`)
  }
  properties.forEach(parseProperty) // antes de copiar nada: un error no deja un feature a medias
  const destDir = path.join(featuresDir, feature)
  if (fs.existsSync(destDir)) throw new Error(`Ya existe ${destDir}`)
  fs.copySync(TEMPLATE_DIR, destDir)
  for (const type of TYPES) makeUpFile(destDir, feature, type, properties)
  if (appModuleFile) addToAppModule(appModuleFile, feature)
  return destDir
}

module.exports = { generateFeature }

if (require.main === module) {
  const [feature, ...properties] = process.argv.slice(2)
  try {
    console.log(`Feature creado en ${generateFeature({ feature, properties })}`)
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
