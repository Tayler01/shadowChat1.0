import React from 'react'
import { LucideProps } from 'lucide-react'

// Tree-shaking friendly icon imports
export { 
  Send,
  Smile, 
  Command,
  Plus,
  Mic,
  X,
  Menu,
  MessageSquare,
  Users,
  User,
  Settings,
  Moon,
  Sun,
  Camera,
  Edit3,
  Save,
  ArrowDown,
  PinOff,
  FileText,
  Eye,
  EyeOff,
  Loader2
} from 'lucide-react'

// Common icon sizes for consistency
export const iconSizes = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4', 
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-8 h-8'
} as const

type IconSize = keyof typeof iconSizes

interface IconWrapperProps extends LucideProps {
  size?: IconSize
}

// Wrapper component for consistent icon styling
export const IconWrapper: React.FC<IconWrapperProps> = ({ 
  size = 'md', 
  className = '', 
  children,
  ...props 
}) => {
  const sizeClass = iconSizes[size]
  return React.cloneElement(children as React.ReactElement, {
    className: `${sizeClass} ${className}`,
    ...props
  })
}