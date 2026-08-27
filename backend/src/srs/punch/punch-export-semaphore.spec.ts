import { PunchExportSemaphore } from './punch-export-semaphore'

describe('PunchExportSemaphore', () => {
  it('cupo 1: el segundo acquire falla', () => {
    const sem = new PunchExportSemaphore()
    expect(sem.tryAcquire()).toBe(true)
    expect(sem.tryAcquire()).toBe(false)
  })

  it('release es idempotente y vuelve a dejar tomar el cupo', () => {
    const sem = new PunchExportSemaphore()
    expect(sem.tryAcquire()).toBe(true)
    sem.release()
    sem.release()
    expect(sem.tryAcquire()).toBe(true)
  })
})
