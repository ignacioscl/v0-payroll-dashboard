/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-unused-vars */
const fs = require('fs-extra')
const path = require('path')
const upperCamelCase = require('uppercamelcase')

const imports = `import { ApiProperty } from '@nestjs/swagger'
import { typeImport } from 'class-validator'
`

const booleanPropertyDummy = `@ApiProperty({
    description: 'Property dummyBoolean',
    type: Boolean,
  })
  @IsBoolean()
  @Column()
  dummyBoolean: boolean

  //propP@ram`

const stringPropertyDummy = `@ApiProperty({
    description: 'Property dummyString',
    type: String,
  })
  @IsString()
  @Column()
  dummyString: string

  //propP@ram`

const numberPropertyDummy = `@ApiProperty({
    description: 'Property dummyNumber',
    type: Number,
  })
  @IsNumber()
  @Column()
  dummyNumber: number

  //propP@ram`

const replaceAll = (string, search, replace) => {
  return string.split(search).join(replace)
}

const makeUpEntity = (fileStr, properties) => {
  var entityFile = imports + fileStr
  if (!properties.length) {
    // eslint-disable-next-line no-param-reassign
    properties = ['dummy:string']
  }
  properties?.forEach(property => {
    const propAndType = property.split(':')
    let prop
    if (propAndType[1] === 'string') {
      entityFile = replaceAll(entityFile, 'typeImport', `IsString, typeImport`)
      prop = replaceAll(stringPropertyDummy, 'dummyString', propAndType[0])
    } else if (propAndType[1] === 'number') {
      entityFile = replaceAll(entityFile, 'typeImport', `IsNumber, typeImport`)
      prop = replaceAll(numberPropertyDummy, 'dummyNumber', propAndType[0])
    } else if (propAndType[1] === 'boolean') {
      entityFile = replaceAll(entityFile, 'typeImport', `IsBoolean, typeImport`)
      prop = replaceAll(booleanPropertyDummy, 'dummyBoolean', propAndType[0])
    }

    if (prop) entityFile = replaceAll(entityFile, `//propP@ram`, prop)
  })

  entityFile = replaceAll(entityFile, `, typeImport`, '')
  entityFile = replaceAll(
    entityFile,
    `\n
  //propP@ram`,
    '',
  )
  entityFile = replaceAll(entityFile, `import { Entity } from 'typeorm'`, `import { Column, Entity } from 'typeorm'`)

  return entityFile
}

//Copy folder
const copyFolder = featureFolder => {
  console.log(`${__dirname}`)
  const srcDir = `${__dirname}/template`

  console.log(srcDir)
  console.log(featureFolder)

  fs.copySync(srcDir, featureFolder, { overwrite: false }, err => {
    if (err) throw err
    console.log('source.txt was copied to destination.txt')
  })
}

//Change entity file name and contents
const makeUpController = (fileStr, featureName) => {
  response = replaceAll(fileStr, `@Controller('/template')`, `@Controller('/${featureName}')`)
  return response
}

const makeUpImports = (fileStr, featureName) => {
  var response = replaceAll(fileStr, 'entity/template', `entity/${featureName}.entity`)
  response = replaceAll(response, 'dto/template/template', `dto/${featureName}/${featureName}.dto`)
  response = replaceAll(response, 'service/template', `service/${featureName}.service`)
  response = replaceAll(response, 'controller/template', `controller/${featureName}.controller`)
  return replaceAll(response, 'repository/template', `repository/${featureName}.repository`)
  return response
}

//Change repository file name and contents
const makeUpFileDto = async (featureName, type = 'dto') => {
  const newName = `${destDirCommons}/${featureName}.${type}.ts`

  const actualName = `${destDirCommons}/../template/template.ts`
  console.log('actualName', actualName)

  const newDir = path.dirname(newName)
  await fs.mkdir(newDir, { recursive: true })
  await fs.copyFile(actualName, newName)

  fs.readFile(newName, 'utf8', function (err, data) {
    if (err) {
      return console.log(err)
    }
    const className = upperCamelCase(featureName)
    var fileStr = replaceAll(data, 'Template', className)

    fileStr = makeUpImports(fileStr, featureName)

    fs.writeFile(newName, fileStr, 'utf8', function (err) {
      if (err) return console.log(err)
    })
  })
}

//Change repository file name and contents
const makeUpFile = async (featureName, type, parameters) => {
  const newName =
    type !== 'module' ? `${destDir}/${type}/${featureName}.${type}.ts` : `${destDir}/${featureName}.${type}.ts`

  const actualName = type !== 'module' ? `${destDir}/${type}/template.ts` : `${destDir}/template.module.ts`
  await fs.rename(actualName, newName)

  fs.readFile(newName, 'utf8', function (err, data) {
    if (err) {
      return console.log(err)
    }
    const className = upperCamelCase(featureName)
    var fileStr = replaceAll(data, 'Template', className)

    fileStr = makeUpImports(fileStr, featureName)

    if (type === 'entity') fileStr = makeUpEntity(fileStr, parameters)
    else if (type === 'controller') fileStr = makeUpController(fileStr, featureName)

    fs.writeFile(newName, fileStr, 'utf8', function (err) {
      if (err) return console.log(err)
    })
  })
}

const addToAppModule = featureModule => {
  const appModuleFile = isWindows
    ? `${__dirname}\\app.module.ts`.replace('\\code-generator', '')
    : `${__dirname}/app.module.ts`.replace('/code-generator', '')
  fs.readFile(appModuleFile, 'utf8', function (err, data) {
    if (err) {
      return console.log(err)
    }
    const className = upperCamelCase(`${featureModule}Module`)
    var fileStr = replaceAll(data, '//TemplateModule', `${className},\n    //TemplateModule`)
    fileStr = replaceAll(
      fileStr,
      '//ImportTemplateModule',
      `import { ${className} } from './features/${featureModule}/${featureModule}.module'\n//ImportTemplateModule`,
    )

    fs.writeFile(appModuleFile, fileStr, 'utf8', function (err) {
      if (err) return console.log(err)
    })
  })
}

const parameters = process.argv.slice(2)
const feature = parameters[0]

const properties = parameters.slice(1)
const isWindows = process.platform === 'win32'

const destDir = isWindows
  ? `${__dirname}\\features\\${feature}`.replace('\\code-generator', '')
  : `${__dirname}/features/${feature}`.replace('/code-generator', '')

const destDirCommons = isWindows
  ? `${__dirname}\\..\\..\\api-commons\\dto\\${feature}`.replace('\\code-generator', '')
  : `${__dirname}/../../api-commons/dto/${feature}`.replace('/code-generator', '')
console.log(destDirCommons)

copyFolder(destDir)
makeUpFile(feature, 'entity', properties)
makeUpFile(feature, 'repository')
makeUpFile(feature, 'dto')
makeUpFile(feature, 'service')
makeUpFile(feature, 'controller')
makeUpFile(feature, 'module')
addToAppModule(feature)
