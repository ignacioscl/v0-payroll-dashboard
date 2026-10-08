import { Module } from '@nestjs/common'

import { EmailHealthIndicator } from './email-health.indicator'
import { EMAIL_CONFIG, EmailConfig, loadEmailConfig } from './email.config'
import { EmailService } from './email.service'
import { EMAIL_TEMPLATES_DIR, EmailTemplateRenderer } from './email.templates'
import { createEmailTransporter, EMAIL_TRANSPORTER } from './email.transport'

/**
 * Módulo de email (plans/plan-nest-email §8.1). Hoja: no importa nada de `features/` ni `srs/`.
 * No es global ni dinámico a propósito: el `imports: [EmailModule]` es la lista de quién manda
 * mails (hoy JobsModule y HealthModule) y hay un solo transporte.
 */
@Module({
  providers: [
    { provide: EMAIL_CONFIG, useFactory: (): EmailConfig => loadEmailConfig(process.env, EMAIL_TEMPLATES_DIR) },
    { provide: EMAIL_TRANSPORTER, useFactory: createEmailTransporter, inject: [EMAIL_CONFIG] },
    {
      provide: EmailTemplateRenderer,
      useFactory: (config: EmailConfig) => new EmailTemplateRenderer(config.templatesDir, !config.isProd),
      inject: [EMAIL_CONFIG],
    },
    EmailService,
    EmailHealthIndicator,
  ],
  exports: [EmailService, EmailHealthIndicator],
})
export class EmailModule {}
