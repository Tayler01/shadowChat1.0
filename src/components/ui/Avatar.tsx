import React, { useState } from 'react';
import { Ghost } from 'lucide-react';
import { getPresenceOption } from '../../lib/presence';
import { usePresenceForUser } from '../../hooks/usePresence';
import type { PresenceState, PresenceVisibility } from '../../types';

interface AvatarProps {
  src?: string;
  alt: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fallback?: string;
  className?: string;
  status?: 'online' | 'away' | 'busy' | 'offline';
  userId?: string;
  presenceState?: PresenceState;
  presenceVisibility?: PresenceVisibility | null;
  color?: string;
  showStatus?: boolean;
}

const sizeClasses = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-12 h-12 text-lg',
  xl: 'w-16 h-16 text-xl',
};

export function Avatar({
  src,
  alt,
  size = 'md',
  fallback,
  className = '',
  status,
  userId,
  presenceState,
  presenceVisibility,
  color,
  showStatus,
}: AvatarProps) {
  const [imageError, setImageError] = useState(false);
  const initials = fallback || alt.split(' ').map(n => n[0]).join('').toUpperCase();
  const livePresence = usePresenceForUser(userId);
  const resolvedPresenceState =
    presenceState ||
    livePresence?.presence_state ||
    (presenceVisibility === 'invisible' ? 'invisible' : undefined);
  const legacyPresence = getPresenceOption(status);
  const showInvisible = resolvedPresenceState === 'invisible';
  const showLiveOnline = showStatus && resolvedPresenceState === 'online';
  const showLegacyStatus = showStatus && !resolvedPresenceState && status;
  
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
      
      {showInvisible && (
        <div
          className="absolute -bottom-1 -right-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-[rgba(255,255,255,0.14)] bg-[rgba(10,11,12,0.94)] text-[rgb(213,220,232)] shadow-[0_0_12px_rgba(255,255,255,0.14)]"
          role="img"
          aria-label="Invisible status"
          title="Invisible"
        >
          <Ghost className="h-2.5 w-2.5" />
        </div>
      )}

      {!showInvisible && showLiveOnline && (
        <div
          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--bg-shell)] bg-[#22c55e] shadow-[0_0_12px_rgba(34,197,94,0.55)]"
          role="img"
          aria-label="Online status"
        />
      )}

      {!showInvisible && showLegacyStatus && (
        <div className={`
          absolute -bottom-0.5 -right-0.5
          w-3 h-3 rounded-full border-2 border-[var(--bg-shell)]
          ${legacyPresence.dotClass}
        `}
          role="img"
          aria-label={`${legacyPresence.label} status`}
        />
      )}
    </div>
  );
}
