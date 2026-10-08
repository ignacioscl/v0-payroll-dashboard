import { Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common'

import { JOB_HANDLERS, JobHandler } from './job.interface'

/** Los jobs registrados por nombre. Falla al arrancar si dos jobs se llaman igual. */
@Injectable()
export class JobRegistryService implements OnModuleInit {
  private readonly byName = new Map<string, JobHandler<any>>()

  constructor(@Inject(JOB_HANDLERS) private readonly handlers: JobHandler<any>[]) {}

  onModuleInit(): void {
    for (const handler of this.handlers) {
      if (this.byName.has(handler.name)) {
        throw new Error(`jobs: hay dos jobs con el nombre «${handler.name}»`)
      }
      this.byName.set(handler.name, handler)
    }
  }

  get(name: string): JobHandler<any> {
    const handler = this.byName.get(name)
    if (!handler) throw new NotFoundException(`Job «${name}» does not exist`)
    return handler
  }

  names(): string[] {
    return [...this.byName.keys()]
  }

  /** Todos los jobs registrados (en orden de registro). */
  all(): JobHandler<any>[] {
    return [...this.byName.values()]
  }
}
