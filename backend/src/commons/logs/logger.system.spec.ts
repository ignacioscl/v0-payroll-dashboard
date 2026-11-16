import { LoggerSystem } from './logger.system'

/** Logs en JSON (plans/plan-buenas-practicas-v0, 3.11): cada evento es una línea JSON válida con sus campos. */
describe('LoggerSystem', () => {
  function capture(stream: NodeJS.WriteStream) {
    const lines: string[] = []
    const spy = jest.spyOn(stream, 'write').mockImplementation((s: string | Uint8Array) => {
      lines.push(String(s))
      return true
    })
    return { lines, restore: () => spy.mockRestore() }
  }

  it('log sale como JSON por stdout con time, level, context y msg', () => {
    const out = capture(process.stdout)
    const logger = new LoggerSystem()
    logger.setContext('Jobs')
    logger.log('job ok', { rows: 3 })
    out.restore()
    const line = JSON.parse(out.lines[0])
    expect(line).toMatchObject({ level: 'log', context: 'Jobs', msg: 'job ok {"rows":3}' })
    expect(new Date(line.time).toString()).not.toBe('Invalid Date')
  })

  it('error con un Error sale por stderr con el stack', () => {
    const err = capture(process.stderr)
    new LoggerSystem().error('falló', new Error('boom'))
    err.restore()
    const line = JSON.parse(err.lines[0])
    expect(line.level).toBe('error')
    expect(line.msg).toBe('falló')
    expect(line.stack).toContain('Error: boom')
  })

  it('error como lo llama Nest (message, stack, context)', () => {
    const err = capture(process.stderr)
    new LoggerSystem().error('Unhandled', 'Error: x\n    at y', 'ExceptionsHandler')
    err.restore()
    expect(JSON.parse(err.lines[0])).toMatchObject({ msg: 'Unhandled', stack: 'Error: x\n    at y', context: 'ExceptionsHandler' })
  })

  it('el contexto de Nest pisa al propio (log con context al final)', () => {
    const out = capture(process.stdout)
    new LoggerSystem().log('Mapped {/api, GET} route', 'RouterExplorer')
    out.restore()
    expect(JSON.parse(out.lines[0])).toMatchObject({ msg: 'Mapped {/api, GET} route', context: 'RouterExplorer' })
  })
})
