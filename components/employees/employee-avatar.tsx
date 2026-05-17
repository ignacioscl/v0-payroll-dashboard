import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { Employee } from '@/lib/types'
import { cn } from '@/lib/utils'

interface EmployeeAvatarProps {
  employee: Employee
  size?: 'sm' | 'md' | 'lg'
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
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-14 w-14'
  }

  const initials = `${employee.firstName[0]}${employee.lastName[0]}`

  return (
    <div className="flex items-center gap-3">
      <Avatar className={cn(sizeStyles[size])}>
        <AvatarImage src={employee.photo} alt={`${employee.firstName} ${employee.lastName}`} />
        <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
          {initials}
        </AvatarFallback>
      </Avatar>
      {(showName || showPosition) && (
        <div className="flex flex-col">
          {showName && (
            <span className="text-sm font-medium text-foreground">
              {employee.firstName} {employee.lastName}
            </span>
          )}
          {showPosition && (
            <span className="text-xs text-muted-foreground">
              {employee.position}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
