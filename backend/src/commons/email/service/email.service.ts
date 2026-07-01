import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'
import * as handlebars from 'handlebars'
import { readFileSync } from 'fs'
import { join } from 'path'

export interface EmailOptions {
  to: string | string[]
  subject: string
  template?: string
  context?: Record<string, any>
  html?: string
  text?: string
  attachments?: Array<{
    filename: string
    content: Buffer | string
    contentType?: string
  }>
}

export interface EmailTemplate {
  subject: string
  template: string
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name)
  private transporter: nodemailer.Transporter
  private readonly templates: Map<string, EmailTemplate> = new Map()

  constructor(private readonly configService: ConfigService) {
    this.loadTemplates()
    // Inicializar el transporter de forma asíncrona
    /*this.initializeTransporter().catch(error => {
      this.logger.error('Error inicializando el transporter de email:', error)
    })*/

    // Envío de prueba hardcodeado
    setTimeout(() => {
      //this.sendTestEmail()
    }, 5000) // Esperar 5 segundos para que se inicialice el transporter
  }

  // Método para envío de prueba hardcodeado
  private async sendTestEmail(): Promise<void> {
    try {
      this.logger.log('📧 Enviando email de prueba a ignaciosc@gmail.com...')

      const success = await this.sendEmail({
        to: 'ignaciosc@gmail.com',
        subject: 'Prueba de Email - Sistema Óptica',
        html: `
          <h1>¡Hola Ignacio!</h1>
          <p>Este es un email de prueba del sistema de óptica.</p>
          <p><strong>Fecha:</strong> ${new Date().toLocaleString('es-AR')}</p>
          <p><strong>Servidor:</strong> ${this.configService.get<string>('emailHost', 'No configurado')}</p>
          <p>Si recibes este email, significa que la configuración SMTP está funcionando correctamente.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">
            Email enviado automáticamente desde el sistema de óptica.
          </p>
        `,
        text: `
          ¡Hola Ignacio!
          
          Este es un email de prueba del sistema de óptica.
          
          Fecha: ${new Date().toLocaleString('es-AR')}
          Servidor: ${this.configService.get<string>('emailHost', 'No configurado')}
          
          Si recibes este email, significa que la configuración SMTP está funcionando correctamente.
          
          ---
          Email enviado automáticamente desde el sistema de óptica.
        `,
      })

      if (success) {
        this.logger.log('✅ Email de prueba enviado exitosamente a ignaciosc@gmail.com', success)
      } else {
        this.logger.error('❌ Error enviando email de prueba a ignaciosc@gmail.com')
      }
    } catch (error) {
      this.logger.error('❌ Error en envío de prueba:', error)
    }
  }

  // Método para probar diferentes configuraciones de InMotion
  private async testInMotionConfigurations(): Promise<void> {
    const configs = [
      { name: 'Puerto 25 (sin SSL)', port: 25, secure: false },
      { name: 'Puerto 587 (STARTTLS)', port: 587, secure: false },
      { name: 'Puerto 465 (SSL)', port: 465, secure: true },
    ]

    for (const config of configs) {
      this.logger.log(`🔍 Probando configuración: ${config.name}`)

      const testConfig = {
        host: 'vps123353.inmotionhosting.com',
        port: config.port,
        secure: config.secure,
        auth: {
          user: this.configService.get<string>('emailUser'),
          pass: this.configService.get<string>('emailPass'),
        },
        tls: {
          rejectUnauthorized: false,
        },
        ignoreTLS: false,
        requireTLS: false,
        name: 'localhost',
        localAddress: '0.0.0.0',
        connectionTimeout: 60000,
        greetingTimeout: 30000,
        socketTimeout: 60000,
      }

      try {
        const testTransporter = nodemailer.createTransport(testConfig)
        await new Promise((resolve, reject) => {
          testTransporter.verify((error, success) => {
            if (error) {
              reject(error)
            } else {
              resolve(success)
            }
          })
        })

        this.logger.log(`✅ Configuración exitosa: ${config.name}`)
        this.transporter = testTransporter
        return
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
        this.logger.warn(`❌ Configuración fallida: ${config.name} - ${errorMessage}`)
      }
    }

    this.logger.error('❌ Todas las configuraciones de InMotion fallaron')
  }

  private async initializeTransporter(): Promise<void> {
    const emailConfig = {
      host: this.configService.get<string>('emailHost'),
      port: this.configService.get<number>('emailPort'),
      secure: false,
      auth: {
        user: this.configService.get<string>('emailUser'),
        pass: this.configService.get<string>('emailPass'),
      },
      // Configuración para manejar certificados SSL autofirmados
      tls: {
        rejectUnauthorized: false,
      },
      // Configuración adicional para servidores VPS
      ignoreTLS: false,
      requireTLS: false,
      // Configuración para resolver problemas de hostname
      name: 'localhost',
      localAddress: '0.0.0.0',
      // Configuración de timeout
      connectionTimeout: 60000,
      greetingTimeout: 30000,
      socketTimeout: 60000,
    }

    // Debug: Mostrar configuración (sin mostrar la contraseña)
    console.log('📧 Email Configuration:', {
      host: emailConfig.host,
      port: emailConfig.port,
      secure: emailConfig.secure,
      user: emailConfig.auth.user,
      pass: emailConfig.auth.pass ? '***CONFIGURADA***' : '❌ NO CONFIGURADA',
    })

    // Validar que las credenciales estén configuradas
    if (!emailConfig.auth.user || !emailConfig.auth.pass) {
      this.logger.warn('⚠️  Credenciales de email no configuradas. El servicio de email no funcionará correctamente.')
      this.logger.warn('   Configura EMAIL_USER y EMAIL_PASS en tu archivo .env')
      return
    }

    try {
      this.transporter = nodemailer.createTransport(emailConfig)

      // Verificar conexión
      await new Promise((resolve, reject) => {
        this.transporter.verify((error: any, success: any) => {
          if (error) {
            this.logger.error('❌ Error verificando conexión de email:', error)
            this.logger.error('   Intentando configuraciones alternativas...')
            reject(error)
          } else {
            this.logger.log('✅ Servidor de email listo para enviar mensajes')

            resolve(success)
          }
        })
      })
    } catch (error) {
      this.logger.warn('🔄 Configuración inicial falló, probando configuraciones alternativas...')
      await this.testInMotionConfigurations()
    }
  }

  private loadTemplates(): void {
    // Cargar templates predefinidos
    this.templates.set('welcome', {
      subject: 'Bienvenido a {{companyName}}',
      template: 'welcome',
    })

    this.templates.set('password-reset', {
      subject: 'Restablecimiento de contraseña - {{companyName}}',
      template: 'password-reset',
    })

    this.templates.set('user-created', {
      subject: 'Usuario creado exitosamente - {{companyName}}',
      template: 'user-created',
    })

    this.templates.set('notification', {
      subject: 'Notificación - {{companyName}}',
      template: 'notification',
    })
  }

  private async loadTemplateFile(templateName: string): Promise<string> {
    try {
      const templatePath = join(__dirname, '..', 'templates', `${templateName}.hbs`)
      return readFileSync(templatePath, 'utf-8')
    } catch (error) {
      this.logger.warn(`Template ${templateName} no encontrado, usando template por defecto`)
      return this.getDefaultTemplate()
    }
  }

  private getDefaultTemplate(): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>{{subject}}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #007bff; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f8f9fa; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>{{companyName}}</h1>
        </div>
        <div class="content">
          {{{content}}}
        </div>
        <div class="footer">
          <p>Este es un mensaje automático, por favor no responda a este email.</p>
          <p>&copy; {{year}} {{companyName}}. Todos los derechos reservados.</p>
        </div>
      </div>
    </body>
    </html>
    `
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      // Verificar que el transporter esté configurado
      if (!this.transporter) {
        this.logger.error('❌ Transporter de email no configurado. Verifica las credenciales SMTP.')
        return false
      }

      let htmlContent = options.html
      let emailSubject = options.subject

      // Si se especifica un template, cargarlo y compilarlo
      if (options.template) {
        const templateFile = await this.loadTemplateFile(options.template)
        const template = handlebars.compile(templateFile)

        const context = {
          ...options.context,
          subject: options.subject,
          companyName: this.configService.get<string>('COMPANY_NAME', 'Óptica'),
          year: new Date().getFullYear(),
          currentDate: new Date().toLocaleDateString('es-AR'),
        }

        htmlContent = template(context)
      }

      const fromEmail =
        this.configService.get<string>('EMAIL_FROM') ||
        this.configService.get<string>('EMAIL_USER') ||
        'noreply@srssuite.com'
      const mailOptions: nodemailer.SendMailOptions = {
        from: fromEmail,
        to: Array.isArray(options.to) ? options.to.join(',') : options.to,
        subject: emailSubject,
        html: htmlContent,
        text: options.text || this.htmlToText(htmlContent!),
        attachments: options.attachments,
      }
      console.log('mailOptions', mailOptions)
      const result = await this.transporter.sendMail(mailOptions)
      this.logger.log(`Email enviado exitosamente a ${options.to}: ${result.messageId}`)
      return true
    } catch (error) {
      this.logger.error('Error enviando email:', error)
      return false
    }
  }

  async sendWelcomeEmail(
    to: string,
    userData: { firstName: string; lastName: string; email: string },
  ): Promise<boolean> {
    return this.sendEmail({
      to,
      subject: `Bienvenido a ${this.configService.get<string>('COMPANY_NAME', 'Óptica')}`,
      template: 'welcome',
      context: {
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        content: `
          <h2>¡Bienvenido/a ${userData.firstName}!</h2>
          <p>Su cuenta ha sido creada exitosamente en nuestro sistema.</p>
          <p><strong>Email:</strong> ${userData.email}</p>
          <p>Ya puede acceder al sistema con sus credenciales.</p>
        `,
      },
    })
  }

  async sendPasswordResetEmail(to: string, resetToken: string, userName: string): Promise<boolean> {
    const resetUrl = `${this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    )}/reset-password?token=${resetToken}`

    return this.sendEmail({
      to,
      subject: `Restablecimiento de contraseña - ${this.configService.get<string>('COMPANY_NAME', 'Óptica')}`,
      template: 'password-reset',
      context: {
        userName,
        resetUrl,
        content: `
          <h2>Restablecimiento de contraseña</h2>
          <p>Hola ${userName},</p>
          <p>Ha solicitado restablecer su contraseña. Haga clic en el siguiente enlace para continuar:</p>
          <p><a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Restablecer contraseña</a></p>
          <p>Si no solicitó este cambio, puede ignorar este email.</p>
          <p>Este enlace expirará en 1 hora.</p>
        `,
      },
    })
  }

  async sendUserCreatedEmail(
    to: string,
    userData: { firstName: string; lastName: string; email: string; role: string },
  ): Promise<boolean> {
    return this.sendEmail({
      to,
      subject: `Usuario creado exitosamente - ${this.configService.get<string>('COMPANY_NAME', 'Óptica')}`,
      template: 'user-created',
      context: {
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        role: userData.role,
        content: `
          <h2>Usuario creado exitosamente</h2>
          <p>Se ha creado un nuevo usuario en el sistema:</p>
          <ul>
            <li><strong>Nombre:</strong> ${userData.firstName} ${userData.lastName}</li>
            <li><strong>Email:</strong> ${userData.email}</li>
            <li><strong>Rol:</strong> ${userData.role}</li>
          </ul>
        `,
      },
    })
  }

  async sendNotificationEmail(to: string, title: string, message: string): Promise<boolean> {
    return this.sendEmail({
      to,
      subject: `Notificación - ${this.configService.get<string>('COMPANY_NAME', 'Óptica')}`,
      template: 'notification',
      context: {
        title,
        message,
        content: `
          <h2>${title}</h2>
          <p>${message}</p>
        `,
      },
    })
  }

  private htmlToText(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim()
  }

  async sendBulkEmail(
    emails: string[],
    options: Omit<EmailOptions, 'to'>,
  ): Promise<{ success: string[]; failed: string[] }> {
    const results = { success: [] as string[], failed: [] as string[] }

    for (const email of emails) {
      const success = await this.sendEmail({ ...options, to: email })
      if (success) {
        results.success.push(email)
      } else {
        results.failed.push(email)
      }
    }

    this.logger.log(`Bulk email completado: ${results.success.length} exitosos, ${results.failed.length} fallidos`)
    return results
  }
}
