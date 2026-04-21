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
    bg-[linear-gradient(180deg,rgba(255,240,184,0.18),rgba(215,170,70,0.12)_34%,rgba(122,89,24,0.52)_100%)]
    text-[var(--text-gold)]
    shadow-[var(--shadow-gold-cta)]
    hover:-translate-y-0.5 hover:scale-[1.01]
    hover:shadow-[0_0_0_1px_rgba(255,240,184,0.24),0_14px_32px_rgba(201,151,47,0.34),inset_0_1px_0_rgba(255,255,255,0.22)]
    active:translate-y-[1px] active:scale-[0.99]
  `,
  secondary: `
    border border-[var(--border-panel)]
    bg-[var(--bg-panel)]
    text-[var(--text-primary)]
    shadow-[var(--shadow-panel)]
    hover:border-[var(--border-glow)]
    hover:bg-[rgba(255,255,255,0.06)]
    hover:text-[var(--text-gold)]
  `,
  ghost: `
    border border-transparent
    bg-transparent
    text-[var(--text-secondary)]
    hover:border-[rgba(215,170,70,0.16)]
    hover:bg-[rgba(255,255,255,0.04)]
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
  return (
    <button
      className={`
        group relative inline-flex items-center justify-center overflow-hidden
        font-medium rounded-[var(--radius-sm)]
        transition-all duration-[var(--dur-med)] ease-[var(--ease-premium)]
        disabled:opacity-50 disabled:cursor-not-allowed
        focus:outline-none focus:ring-2 focus:ring-[rgba(215,170,70,0.22)] focus:ring-offset-0
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
            className="pointer-events-none absolute inset-[1px] rounded-[calc(var(--radius-sm)-1px)] bg-[radial-gradient(circle_at_50%_0%,rgba(255,240,184,0.18),transparent_42%),linear-gradient(180deg,rgba(27,24,18,0.98),rgba(13,13,13,0.98))]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-[18%] top-[1px] h-[42%] rounded-full bg-[linear-gradient(180deg,rgba(255,248,225,0.32),rgba(255,248,225,0))] blur-sm"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -left-1/3 top-0 h-full w-1/3 -skew-x-12 bg-[linear-gradient(90deg,transparent,rgba(255,240,184,0.24),transparent)] opacity-0 transition-all duration-500 ease-[var(--ease-premium)] group-hover:translate-x-[230%] group-hover:opacity-100"
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
