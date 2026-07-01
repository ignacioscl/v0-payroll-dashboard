import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable } from 'rxjs'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class CompanyInterceptor implements NestInterceptor {
  constructor(private readonly jwtService: JwtService, private readonly configService: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest()

    // Extraer company token
    const companyToken = request.headers['x-company-token']
    console.log('🔍 Company Interceptor - companyToken: x-company-token', companyToken)
    if (companyToken) {
      try {
        const company = this.jwtService.verify(companyToken, {
          secret: this.configService.get<string>('jwtSecret'),
        })
        request.company = company
        console.log('🔍 Company Interceptor - Token decodificado:', company)
      } catch (error) {
        console.warn('⚠️ Company Interceptor - Token inválido:', (error as Error).message)
      }
    } else {
      console.log('🔍 Company Interceptor - No se encontró X-Company-Token header')
    }

    // Extraer idioma del header Accept-Language
    const acceptLanguage = request.headers['accept-language']
    console.log('🔍 Company Interceptor - Accept-Language:', acceptLanguage)
    if (acceptLanguage) {
      // Extraer el primer idioma (ej: "es-ES,es;q=0.9,en;q=0.8" -> "es-ES")
      const language = acceptLanguage.split(',')[0].split(';')[0].trim()
      request.language = language
      //console.log('🔍 Company Interceptor - Idioma extraído:', language)
    } else {
      request.language = 'en' // Idioma por defecto
      //console.log('🔍 Company Interceptor - No se encontró Accept-Language, usando por defecto: en')
    }

    return next.handle()
  }
}
