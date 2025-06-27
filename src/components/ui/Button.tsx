import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: React.ReactNode;
}

const variants = {
  primary: 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl',
  secondary: 'bg-gray-100 hover:bg-gray-200 text-gray-900 border border-gray-300',
  ghost: 'hover:bg-gray-100 text-gray-700 hover:text-gray-900',
  danger: 'bg-red-600 hover:bg-red-700 text-white shadow-lg hover:shadow-xl',
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center
        font-medium rounded-lg
        transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        ${variants[variant]}
        ${sizes[size]}
        ${className}
      `}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
      {children}
    </button>
  );
}
