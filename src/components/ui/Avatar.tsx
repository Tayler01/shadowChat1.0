import React, { useState } from 'react';

interface AvatarProps {
  src?: string;
  alt: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fallback?: string;
  className?: string;
  status?: 'online' | 'away' | 'busy' | 'offline';
  color?: string;
  showStatus?: boolean;
}

const sizeClasses = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-12 h-12 text-lg',
  xl: 'w-16 h-16 text-xl',
};

const statusColors = {
  online: 'bg-[var(--state-success)]',
  away: 'bg-[var(--state-warning)]',
  busy: 'bg-[var(--state-danger)]',
  offline: 'bg-[var(--state-muted)]',
};

export function Avatar({
  src,
  alt,
  size = 'md',
  fallback,
  className = '',
  status,
  color,
  showStatus,
}: AvatarProps) {
  const [imageError, setImageError] = useState(false);
  const initials = fallback || alt.split(' ').map(n => n[0]).join('').toUpperCase();
  
  return (
    <div className={`relative inline-block ${className}`}>
      <div
        className={`
        ${sizeClasses[size]}
        rounded-full
        overflow-hidden
        ${color ? '' : 'border border-[var(--border-glow)] bg-[linear-gradient(180deg,rgba(255,240,184,0.12),rgba(255,255,255,0.04)_26%,rgba(14,16,17,0.98)_100%)]'}
        flex items-center justify-center
        text-[var(--text-gold)] font-medium
        ring-2 ring-[rgba(255,255,255,0.08)]
        transition-all duration-200 hover:scale-105
      `}
        style={color ? { backgroundColor: color } : undefined}
      >
        {src && !imageError ? (
          <img
            src={src}
            alt={alt}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <span className="select-none">{initials}</span>
        )}
      </div>
      
      {showStatus && status && (
        <div className={`
          absolute -bottom-0.5 -right-0.5
          w-3 h-3 rounded-full border-2 border-white
          ${statusColors[status]}
        `} />
      )}
    </div>
  );
}
