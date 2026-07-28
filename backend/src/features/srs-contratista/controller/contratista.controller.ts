import { createReadStream } from 'fs'
import { mkdir, unlink, writeFile } from 'fs/promises'
import { extname, join } from 'path'

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Post,
  Put,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger'

import { SrsJwtGuard } from 'src/srs/auth/srs-jwt.guard'
import { UpdateBrandingDto } from '../dto/contratista.dto'
import { ContratistaService } from '../service/contratista.service'

/**
 * Where uploaded logos live. Same dir ServeStaticModule roots at, so the file also
 * exists on disk outside the image: docker-compose mounts ./uploads/branding here.
 * cwd is /app in the container and backend/ in dev — correct in both.
 */
const LOGO_DIR = join(process.cwd(), 'public', 'branding')

const ALLOWED_TYPES = new Map<string, string>([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/svg+xml', '.svg'],
])

const MAX_LOGO_BYTES = 1024 * 1024

interface UploadedLogo {
  originalname: string
  mimetype: string
  size: number
  buffer: Buffer
}

@UseGuards(SrsJwtGuard)
@Controller('/srs/contratista')
@ApiTags('SRS Contratista')
@ApiBearerAuth()
export class ContratistaController {
  constructor(@Inject(ContratistaService) private readonly service: ContratistaService) {}

  @Get('branding')
  getBranding(@Req() request: any) {
    return this.service.getBranding(request.srsContext)
  }

  @Put('branding')
  updateBranding(@Req() request: any, @Body() body: UpdateBrandingDto) {
    return this.service.updateBranding(request.srsContext, body)
  }

  /**
   * Streams the v0 logo. The browser cannot reach the static mount directly — it only
   * talks to this backend through the Next proxy — so the file is served from here.
   */
  @Get('branding/logo')
  async getLogo(@Req() request: any, @Res({ passthrough: true }) response: any) {
    const branding = await this.service.getBranding(request.srsContext)
    if (!branding.logoFile || !branding.logoIsV0) {
      throw new NotFoundException('No v0 logo set')
    }
    const type = [...ALLOWED_TYPES.entries()].find(
      ([, ext]) => ext === extname(branding.logoFile!).toLowerCase(),
    )
    response.set({
      'Content-Type': type?.[0] ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=300',
    })
    return new StreamableFile(createReadStream(join(LOGO_DIR, branding.logoFile)))
  }

  @Post('branding/logo')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadLogo(@Req() request: any, @UploadedFile() file: UploadedLogo) {
    if (!file) throw new BadRequestException('No file uploaded')

    const ext = ALLOWED_TYPES.get(file.mimetype)
    if (!ext) throw new BadRequestException('Logo must be PNG, JPG, WEBP or SVG')
    if (file.size > MAX_LOGO_BYTES) throw new BadRequestException('Logo must be under 1 MB')

    const previous = await this.service.getBranding(request.srsContext)
    const fileName = `${request.srsContext.idDealerProvider}-${Date.now()}${ext}`

    await mkdir(LOGO_DIR, { recursive: true })
    await writeFile(join(LOGO_DIR, fileName), file.buffer)

    const branding = await this.service.setV0Logo(request.srsContext, fileName)

    // Best effort: the row already points at the new file, so an orphan left behind
    // is cosmetic and must not fail the request.
    if (previous.logoIsV0 && previous.logoFile && previous.logoFile !== fileName) {
      await unlink(join(LOGO_DIR, previous.logoFile)).catch(() => undefined)
    }
    return branding
  }

  @Delete('branding/logo')
  async deleteLogo(@Req() request: any) {
    const previous = await this.service.getBranding(request.srsContext)
    const branding = await this.service.clearV0Logo(request.srsContext)
    if (previous.logoIsV0 && previous.logoFile) {
      await unlink(join(LOGO_DIR, previous.logoFile)).catch(() => undefined)
    }
    return branding
  }
}
