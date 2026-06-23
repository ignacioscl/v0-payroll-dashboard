import { Controller, Get, HttpCode, HttpStatus, Post, Request, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'

import { AuthService } from '../service/auth.service'
import { LocalAuthGuard } from '../guard/local.guard'
import { RequestWithUser } from '../types/request.user.type'
import { AuthDto, SessionDto } from '../dto/auth.dto'
import { JwtRefreshAuthGuard } from '../guard/jwt.refresh.guard'
import { JwtAuthGuard } from '../guard/jwt.guard'
import { UserCompanyRelDto } from 'src/features/user.company.rel/dto/user.company.rel.dto'
import { User } from 'src/features/user/entity/user.entity'
import { RoleEnum } from 'src/commons/enum/role.enum'
import { ParametricDataService } from 'src/features/parametric-data/service/parametric-data.service'
import { ParametricDataCategories } from 'src/commons/enum/parametric-data-categories'

@Controller('auth')
@ApiTags('Auth')
export class AuthController {
  constructor(private authService: AuthService, private parametricDataService: ParametricDataService) {}

  @UseGuards(LocalAuthGuard)
  @Post('login')
  @ApiBody({ type: AuthDto })
  @ApiOkResponse({ type: SessionDto, description: 'User authenticated' })
  @ApiUnauthorizedResponse({ description: 'Wrong credentials' })
  @HttpCode(HttpStatus.OK)
  async login(@Request() req: RequestWithUser) {
    const { user } = req
    console.log('user2', user)
    return this.authService.login(user as User)
  }

  @UseGuards(JwtRefreshAuthGuard)
  @Post('login/refresh')
  @ApiOkResponse({ type: SessionDto, description: 'User authenticated' })
  @ApiUnauthorizedResponse({ description: 'Wrong credentials' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async refresh(@Request() req: RequestWithUser) {
    const { user } = req
    return this.authService.login(user as User)
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiOkResponse({ description: 'Profile user' })
  @ApiUnauthorizedResponse({ description: 'Wrong credentials' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async me(@Request() req: RequestWithUser) {
    return req.user
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/companies')
  @ApiOkResponse({ type: UserCompanyRelDto, isArray: true, description: 'User companies' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async getUserCompanies(@Request() req: RequestWithUser) {
    return this.authService.getUserCompanies(req.user as User)
  }

  async menu(@Request() req: RequestWithUser) {
    return await this.menuReal(req)
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/menu')
  @ApiOkResponse({ description: 'User menu' })
  @ApiUnauthorizedResponse({ description: 'Wrong credentials' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async menuReal(@Request() req: RequestWithUser) {
    const menuData = await this.parametricDataService.fetch({
      idParametricCategory: ParametricDataCategories.MENU.id,
    })

    const groups = menuData.data.filter(item => !item.idParent)
    const items = menuData.data.filter(item => item.idParent)

    // Misma estructura que menuMockSmall(): [{ name, children: [{ name, icon, action } | { separator: true }] }]
    return groups
      .sort((a, b) => (a.orderBy ?? 0) - (b.orderBy ?? 0))
      .map(group => {
        const children = items
          .filter(item => item.idParent === group.id)
          .sort((a, b) => (a.orderBy ?? 0) - (b.orderBy ?? 0))
          .map(item => {
            const jsonInfo = item.jsonInfo ? JSON.parse(item.jsonInfo) : {}
            if (jsonInfo.separator === true) {
              return { separator: true }
            }
            return {
              name: item.name,
              icon: jsonInfo.icon || 'LayoutGrid',
              action: jsonInfo.action ?? '',
            }
          })
        return { name: group.name, children }
      })
  }
  menuMock() {
    return [
      {
        name: 'Archivo',
        children: [
          { name: 'Nuevo', icon: 'FilePlus', action: () => console.log('Nuevo') },
          { name: 'Abrir', icon: 'FolderOpen', action: () => console.log('Abrir') },
          { name: 'Guardar', icon: 'Save', action: () => console.log('Guardar') },
          { name: 'Guardar como', icon: 'SaveAll', action: () => console.log('Guardar como') },
          { separator: true },
          {
            name: 'Importar',
            icon: 'Import',
            children: [
              { name: 'Desde CSV', icon: 'FileText', action: () => console.log('Importar CSV') },
              {
                name: 'Desde Excel',
                icon: 'FileSpreadsheet',
                action: () => console.log('Importar Excel'),
              },
              { name: 'Desde JSON', icon: 'FileJson', action: () => console.log('Importar JSON') },
            ],
          },
          {
            name: 'Exportar',
            icon: 'Download',
            children: [
              { name: 'Como CSV', icon: 'FileText', action: () => console.log('Exportar CSV') },
              {
                name: 'Como Excel',
                icon: 'FileSpreadsheet',
                action: () => console.log('Exportar Excel'),
              },
              { name: 'Como PDF', icon: 'FileType', action: () => console.log('Exportar PDF') },
            ],
          },
          { separator: true },
          { name: 'Imprimir', icon: 'Printer', action: () => console.log('Imprimir') },
        ],
      },
      {
        name: 'Editar',
        children: [
          { name: 'Deshacer', icon: 'Undo', action: () => console.log('Deshacer') },
          { name: 'Rehacer', icon: 'Redo', action: () => console.log('Rehacer') },
          { separator: true },
          { name: 'Cortar', icon: 'Scissors', action: () => console.log('Cortar') },
          { name: 'Copiar', icon: 'Copy', action: () => console.log('Copiar') },
          { name: 'Pegar', icon: 'Clipboard', action: () => console.log('Pegar') },
          { separator: true },
          { name: 'Buscar', icon: 'Search', action: () => console.log('Buscar') },
          { name: 'Reemplazar', icon: 'Replace', action: () => console.log('Reemplazar') },
        ],
      },
      {
        name: 'Ver',
        children: [
          { name: 'Zoom In', icon: 'ZoomIn', action: () => console.log('Zoom In') },
          { name: 'Zoom Out', icon: 'ZoomOut', action: () => console.log('Zoom Out') },
          { name: 'Ajustar a ventana', icon: 'Maximize', action: () => console.log('Ajustar') },
          { separator: true },
          {
            name: 'Pantalla completa',
            icon: 'Fullscreen',
            action: () => console.log('Pantalla completa'),
          },
        ],
      },
      {
        name: 'Insertar',
        children: [
          { name: 'Fila arriba', icon: 'ArrowUp', action: () => console.log('Fila arriba') },
          { name: 'Fila abajo', icon: 'ArrowDown', action: () => console.log('Fila abajo') },
          {
            name: 'Columna izquierda',
            icon: 'ArrowLeft',
            action: () => console.log('Columna izquierda'),
          },
          {
            name: 'Columna derecha',
            icon: 'ArrowRight',
            action: () => console.log('Columna derecha'),
          },
          { separator: true },
          { name: 'Imagen', icon: 'Image', action: () => console.log('Imagen') },
          { name: 'Gráfico', icon: 'BarChart', action: () => console.log('Gráfico') },
        ],
      },
      {
        name: 'Formato',
        children: [
          { name: 'Negrita', icon: 'Bold', action: () => console.log('Negrita') },
          { name: 'Cursiva', icon: 'Italic', action: () => console.log('Cursiva') },
          { name: 'Subrayado', icon: 'Underline', action: () => console.log('Subrayado') },
          { separator: true },
          { name: 'Color de texto', icon: 'Palette', action: () => console.log('Color texto') },
          { name: 'Color de fondo', icon: 'PaintBucket', action: () => console.log('Color fondo') },
          { separator: true },
          {
            name: 'Alineación',
            icon: 'AlignLeft',
            children: [
              {
                name: 'Izquierda',
                icon: 'AlignLeft',
                action: () => console.log('Alinear izquierda'),
              },
              { name: 'Centro', icon: 'AlignCenter', action: () => console.log('Alinear centro') },
              { name: 'Derecha', icon: 'AlignRight', action: () => console.log('Alinear derecha') },
            ],
          },
        ],
      },
      {
        name: 'Ayuda',
        children: [
          { name: 'Documentación', icon: 'BookOpen', action: () => console.log('Documentación') },
          { name: 'Atajos de teclado', icon: 'Keyboard', action: () => console.log('Atajos') },
          { separator: true },
          { name: 'Acerca de', icon: 'Info', action: () => console.log('Acerca de') },
        ],
      },
    ]
  }

  menuMockSmall() {
    return [
      {
        name: 'Dashboard',
        children: [
          { name: 'Production', icon: 'Wrench', action: 'kpis/production' },
          { name: 'Billing', icon: 'Receipt', action: 'kpis/billing' },
          { name: 'Collections', icon: 'Banknote', action: 'kpis/collections' },
          { name: 'Punch Quality', icon: 'Fingerprint', action: 'kpis/punch' },
          { name: 'Payroll', icon: 'HandCoins', action: 'kpis/payroll' },
        ],
      },
    ]
  }
}
