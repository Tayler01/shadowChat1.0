import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { LoginForm } from './LoginForm';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading, error } = useAuth();
  const isReconnecting = error?.startsWith('Still reconnecting');

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[radial-gradient(circle_at_top,rgba(215,170,70,0.08),transparent_30%),linear-gradient(180deg,var(--bg-shell),var(--bg-app))]">
        <div className="glass-panel-strong max-w-sm space-y-4 rounded-[var(--radius-xl)] px-10 py-9 text-center">
          <LoadingSpinner size="lg" />
          <div>
            <p className="text-lg font-medium text-[var(--text-primary)]">Restoring your workspace</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Loading messages, presence, and account state.</p>
          </div>
          {error && (
            <p className={`text-sm ${isReconnecting ? 'text-[var(--text-gold)]' : 'text-red-300'}`}>
              {isReconnecting ? error : `Error: ${error}`}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  return <>{children}</>;
}
