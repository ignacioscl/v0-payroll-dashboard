import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { Employee } from '@/lib/types'
import { cn } from '@/lib/utils'

interface EmployeeAvatarProps {
  employee: Employee
  size?: 'xs' | 'sm' | 'md' | 'lg'
  showName?: boolean
  showPosition?: boolean
}

export function EmployeeAvatar({
  employee,
  size = 'md',
  showName = false,
  showPosition = false
}: EmployeeAvatarProps) {
  const sizeStyles = {
    xs: 'h-7 w-7',
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-14 w-14'
  }

  const initials = `${employee.firstName[0]}${employee.lastName[0]}`

  return (
    <div className={cn('flex items-center', size === 'xs' ? 'gap-2' : 'gap-3')}>
      <Avatar className={cn(sizeStyles[size])}>
        <AvatarImage src={employee.photo} alt={`${employee.firstName} ${employee.lastName}`} />
        <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-medium">
          {initials}
        </AvatarFallback>
      </Avatar>
      {(showName || showPosition) && (
        <div className="flex min-w-0 flex-col">
          {showName && (
            <span className={cn(
              'font-medium text-foreground leading-tight',
              size === 'xs' ? 'text-xs' : 'text-sm',
            )}>
              {employee.firstName} {employee.lastName}
            </span>
          )}
          {showPosition && (
            <span className={cn(
              'text-muted-foreground leading-tight',
              size === 'xs' ? 'text-[11px]' : 'text-xs',
            )}>
              {employee.position}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
