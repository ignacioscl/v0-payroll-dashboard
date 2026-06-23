import { Controller, Get } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'

/** Healthcheck del contenedor (lo consume el healthcheck del docker-compose). */
@Controller('/health')
@ApiTags('Health')
export class HealthController {
  @Get('/')
  @ApiOkResponse({ description: 'OK' })
  check() {
    return { status: 'ok', uptime: process.uptime() }
  }
}
