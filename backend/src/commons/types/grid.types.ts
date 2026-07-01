// Tipos para la nueva estructura unificada del grid

export interface GridRowData {
  id: string
  cells: GridCellData[]
}
export interface GridHeaderData {
  columnIndex: number
  columnName: string
  columnType:
    | 'input'
    | 'switch'
    | 'number-input'
    | 'select'
    | 'combobox'
    | 'combobox-api'
    | 'datetime'
    | 'text'
    | 'number-text'
    | 'modal'
    | 'icon-actions'
    | 'masked-date-input'
  columnWidth?: number
  required?: 0 | 1 | null
  editable?: 0 | 1
  options?: string[] | Array<{ value: string; label: string }>
  metadata?: {
    switchConfig?: {
      trueValue: string
      falseValue: string
    }
    modal?: {
      modalId: string
      title: string
    }
    comboboxApi?: {
      url: string
      valueKey: string
      displayKey: string
      searchParam: string
      placeholder: string
      queryParams?: string
      queryParamsTemplate?: string // Template con formato {A:yyyy-mm}, {B}, etc.
    }
    maskedDateInput?: {
      format:
        | 'DD/MM/YYYY'
        | 'MM/DD/YYYY'
        | 'YYYY/MM/DD'
        | 'DD/MM/YY'
        | 'MM/DD/YY'
        | 'YY/MM/DD'
        | 'DD/MM/YYYY HH:mm'
        | 'MM/DD/YYYY HH:mm'
        | 'YYYY/MM/DD HH:mm'
        | 'DD/MM/YY HH:mm'
        | 'MM/DD/YY HH:mm'
        | 'YY/MM/DD HH:mm'
      placeholder: string
      mask:
        | 'DD/MM/YYYY'
        | 'MM/DD/YYYY'
        | 'YYYY/MM/DD'
        | 'DD/MM/YY'
        | 'MM/DD/YY'
        | 'YY/MM/DD'
        | 'DD/MM/YYYY HH:mm'
        | 'MM/DD/YYYY HH:mm'
        | 'YYYY/MM/DD HH:mm'
        | 'DD/MM/YY HH:mm'
        | 'MM/DD/YY HH:mm'
        | 'YY/MM/DD HH:mm'
    }
    select?: {
      placeholder: string
      options: Array<{ value: string; label: string }>
    }
    calculationConfig?: {
      formula: string // Fórmula estilo Excel personalizada
      // Ejemplo: "=SI(O>=101,O*145.87,GET(N,employeePaymentDriver))+P+Q+(R*432.34)"
      description?: string // Descripción opcional de la fórmula
    }
  }
  idDependent?: number
  // Acciones (para tipo 'icon-actions')
  iconActions?: Array<{
    icon: string // Nombre del icono como string (ej: 'edit', 'trash2', 'copy')
    onClick: string
    label: string
    variant?: 'ghost' | 'default' | 'destructive' | 'outline' | 'secondary' | 'link'
    size?: 'default' | 'sm' | 'lg' | 'icon'
  }>
  leftCell?: 0 | 1 | 2 | 3 // Índice de columna fija izquierda
  rightCell?: 0 | 1 | 2 | 3 // Índice de columna fija derecha
  style?: {
    fontFamily?: string // 'font-sans', 'font-serif', 'font-mono'
    fontSize?: string // 'text-xs', 'text-sm', 'text-base', 'text-lg'
    fontWeight?: string // 'bold', 'normal'
    fontStyle?: string // 'italic', 'normal'
    textDecoration?: string // 'underline', 'line-through', 'none'
    textAlign?: string // 'left', 'center', 'right'
    color?: string // 'text-red-600', 'text-blue-600'
    backgroundColor?: string // 'bg-red-100', 'bg-blue-100'
  }
  border?: {
    top?: 'thin' | 'medium' | 'thick' | 'none'
    right?: 'thin' | 'medium' | 'thick' | 'none'
    bottom?: 'thin' | 'medium' | 'thick' | 'none'
    left?: 'thin' | 'medium' | 'thick' | 'none'
    topColor?: string // 'border-red-600'
    rightColor?: string
    bottomColor?: string
    leftColor?: string
  }
  // Configuración para campos calculados
}
export interface GridCellData {
  // Identificación
  id: number
  value: string | null

  // Posición de la celda (opcional)

  // Si no tiene leftCell ni rightCell = celda central scrolleable

  metadata?: {
    [key: string]: any // Mantener compatibilidad con otros metadatos existentes (selectedItem, etc.)
  } & {
    isCalculated?: boolean // Si true, la celda está en modo cálculo; si false, está en modo manual
  }
  idDependent?: number

  // Estilos de la celda
  style?: {
    fontFamily?: string // 'font-sans', 'font-serif', 'font-mono'
    fontSize?: string // 'text-xs', 'text-sm', 'text-base', 'text-lg'
    fontWeight?: string // 'bold', 'normal'
    fontStyle?: string // 'italic', 'normal'
    textDecoration?: string // 'underline', 'line-through', 'none'
    textAlign?: string // 'left', 'center', 'right'
    color?: string // 'text-red-600', 'text-blue-600'
    backgroundColor?: string // 'bg-red-100', 'bg-blue-100'
  }

  // Bordes de la celda
  border?: {
    top?: 'thin' | 'medium' | 'thick' | 'none'
    right?: 'thin' | 'medium' | 'thick' | 'none'
    bottom?: 'thin' | 'medium' | 'thick' | 'none'
    left?: 'thin' | 'medium' | 'thick' | 'none'
    topColor?: string // 'border-red-600'
    rightColor?: string
    bottomColor?: string
    leftColor?: string
  }
}
