import { Injectable } from '@nestjs/common'

/** In-process cupo 1. Singleton in SrsPunchModule. */
@Injectable()
export class PunchExportSemaphore {
  private busy = false

  tryAcquire(): boolean {
    if (this.busy) return false
    this.busy = true
    return true
  }

  release(): void {
    this.busy = false
  }
}
