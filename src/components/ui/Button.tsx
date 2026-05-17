import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: React.ReactNode;
}

const variants = {
  primary: `
    border border-[var(--border-glow)]
    bg-[var(--button-primary-bg)]
    text-[var(--theme-accent-text)]
    shadow-[var(--shadow-cta)]
    hover:-translate-y-0.5 hover:scale-[1.01]
    hover:shadow-[var(--button-primary-hover-shadow)]
    active:translate-y-[1px] active:scale-[0.99]
  `,
  secondary: `
    border border-[var(--border-panel)]
    bg-[var(--bg-panel)]
    text-[var(--text-primary)]
    shadow-[var(--shadow-panel)]
    hover:border-[var(--border-glow)]
    hover:bg-[var(--theme-surface-hover)]
    hover:text-[var(--theme-accent-readable)]
  `,
  ghost: `
    border border-transparent
    bg-transparent
    text-[var(--text-secondary)]
    hover:border-[var(--theme-accent-border-soft)]
    hover:bg-[var(--theme-accent-soft)]
    hover:text-[var(--text-primary)]
  `,
  danger: `
    border border-[rgba(190,52,85,0.45)]
    bg-[linear-gradient(180deg,rgba(132,24,45,0.92),rgba(87,14,28,0.98))]
    text-white
    shadow-[0_10px_24px_rgba(87,14,28,0.26)]
    hover:-translate-y-0.5 hover:border-[rgba(235,99,133,0.58)]
    hover:bg-[linear-gradient(180deg,rgba(150,31,57,0.94),rgba(101,17,34,1))]
  `,
};

const sizes = {
  sm: 'px-3.5 py-2 text-sm',
  md: 'px-4 py-2.5 text-sm',
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
  const hasExplicitPosition = /(^|\s)!?(absolute|fixed|sticky|static)(\s|$)/.test(className);

  return (
    <button
      className={`
        group ${hasExplicitPosition ? '' : 'relative'} inline-flex items-center justify-center overflow-hidden
        font-medium rounded-[var(--radius-sm)]
        transition-[background-color,border-color,box-shadow,color,opacity,transform] duration-[var(--dur-med)] ease-[var(--ease-premium)]
        disabled:opacity-50 disabled:cursor-not-allowed
        focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)] focus:ring-offset-0
        ${variants[variant]}
        ${sizes[size]}
        ${className}
      `}
      disabled={disabled || loading}
      {...props}
    >
      {variant === 'primary' && (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-[1px] rounded-[calc(var(--radius-sm)-1px)] bg-[var(--button-primary-inner-bg)]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-[18%] top-[1px] h-[42%] rounded-full bg-[var(--button-primary-highlight)] blur-sm"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -left-1/3 top-0 h-full w-1/3 -skew-x-12 bg-[var(--button-primary-sheen)] opacity-0 transition-[opacity,transform] duration-500 ease-[var(--ease-premium)] group-hover:translate-x-[230%] group-hover:opacity-100"
          />
        </>
      )}
      <span className="relative z-10 inline-flex items-center justify-center">
        {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {children}
      </span>
    </button>
  );
}
