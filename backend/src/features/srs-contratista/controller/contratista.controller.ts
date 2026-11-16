import { createReadStream } from 'fs'
import { mkdir, unlink, writeFile } from 'fs/promises'
import { extname, join } from 'path'

import {
  ArgumentsHost,
  BadRequestException,
  Body,
  Catch,
  ExceptionFilter,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  PayloadTooLargeException,
  Post,
  Put,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger'

import { detectImage } from '../../../commons/upload/image-signature'
import { UpdateBrandingDto } from '../dto/contratista.dto'
import { ContratistaService } from '../service/contratista.service'

/**
 * Where uploaded logos live, on disk outside the image: docker-compose mounts ./uploads/branding here. Nothing serves
 * this folder directly (ServeStaticModule is gone, plans/plan-buenas-practicas-v0 3.6): `getLogo` streams the file.
 * cwd is /app in the container and backend/ in dev — correct in both.
 */
const LOGO_DIR = join(process.cwd(), 'public', 'branding')

/** Types served back by extension. SVG is no longer accepted (D8); the ones already uploaded are served sandboxed. */
const SERVED_TYPES = new Map<string, string>([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
])

export const MAX_LOGO_BYTES = 1024 * 1024
/** Texts of D1 (the screen also checks before uploading, translated). */
export const LOGO_TYPE_MESSAGE = 'Only PNG, JPG or WEBP images are allowed.'
export const LOGO_SIZE_MESSAGE = 'The logo is over 1 MB.'

/** multer cuts the upload at MAX_LOGO_BYTES with «File too large»: same 413, with the text of D1. */
@Catch(PayloadTooLargeException)
class LogoTooLargeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse()
    response.status(413).json({ statusCode: 413, message: LOGO_SIZE_MESSAGE })
  }
}

interface UploadedLogo {
  originalname: string
  mimetype: string
  size: number
  buffer: Buffer
}
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
    const type = SERVED_TYPES.get(extname(branding.logoFile).toLowerCase())
    response.set({
      'Content-Type': type ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      // An SVG uploaded before D8 can carry script: opened directly, it runs in nothing.
      ...(type === 'image/svg+xml'
        ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" }
        : {}),
    })
    return new StreamableFile(createReadStream(join(LOGO_DIR, branding.logoFile)))
  }

  @Post('branding/logo')
  @ApiConsumes('multipart/form-data')
  // multer stops reading at MAX_LOGO_BYTES (the file is not kept whole in memory first).
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_LOGO_BYTES, files: 1 } }))
  @UseFilters(LogoTooLargeFilter)
  async uploadLogo(@Req() request: any, @UploadedFile() file: UploadedLogo) {
    if (!file) throw new BadRequestException('No file uploaded')

    // By content, not by what the browser declares.
    const ext = detectImage(file.buffer)?.ext
    if (!ext) throw new BadRequestException(LOGO_TYPE_MESSAGE)

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
