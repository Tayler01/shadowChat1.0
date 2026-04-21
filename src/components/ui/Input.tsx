import React, { forwardRef, useId } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className = '', id, ...props }, ref) => {
    const generatedId = useId()
    const inputId = id || generatedId
    const helperId = helperText ? `${inputId}-helper` : undefined
    const errorId = error ? `${inputId}-error` : undefined

    return (
      <div className="space-y-1">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-[var(--text-secondary)]"
          >
            {label}
          </label>
        )}
        
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={errorId || helperId}
          className={`
            obsidian-input w-full px-3.5 py-2.5 rounded-[var(--radius-sm)]
            placeholder:text-[var(--text-muted)]
            focus:outline-none
            ${error ? 'border-red-500 focus:!border-red-500 focus:!shadow-[0_0_0_1px_rgba(239,68,68,0.28),0_0_0_4px_rgba(239,68,68,0.12)]' : ''}
            ${className}
          `}
          {...props}
        />
        
        {error && (
          <p id={errorId} className="text-sm text-red-300">{error}</p>
        )}
        
        {helperText && !error && (
          <p id={helperId} className="text-sm text-[var(--text-muted)]">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
