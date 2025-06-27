import React from 'react';

interface AvatarProps {
  src?: string;
  alt: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fallback?: string;
  className?: string;
  status?: 'online' | 'away' | 'busy' | 'offline';
}

const sizeClasses = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-12 h-12 text-lg',
  xl: 'w-16 h-16 text-xl',
};

const statusColors = {
  online: 'bg-green-500',
  away: 'bg-yellow-500',
  busy: 'bg-red-500',
  offline: 'bg-gray-400',
};

export function Avatar({ src, alt, size = 'md', fallback, className = '', status }: AvatarProps) {
  const initials = fallback || alt.split(' ').map(n => n[0]).join('').toUpperCase();
  
  return (
    <div className={`relative inline-block ${className}`}>
      <div className={`
        ${sizeClasses[size]} 
        rounded-full 
        overflow-hidden 
        bg-gradient-to-br from-blue-500 to-purple-600
        flex items-center justify-center
        text-white font-medium
        ring-2 ring-white
        transition-all duration-200 hover:scale-105
      `}>
        {src ? (
          <img
            src={src}
            alt={alt}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <span className="select-none">{initials}</span>
        )}
      </div>
      
      {status && (
        <div className={`
          absolute -bottom-0.5 -right-0.5
          w-3 h-3 rounded-full border-2 border-white
          ${statusColors[status]}
        `} />
      )}
    </div>
  );
}