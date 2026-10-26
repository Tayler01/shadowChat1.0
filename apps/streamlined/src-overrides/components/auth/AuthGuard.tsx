import React, { lazy, Suspense, useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { LoadingSpinner } from '../../../../../src/components/ui/LoadingSpinner';
import { LoginForm } from './LoginForm';
import { SHADOW_CIRCUIT_ENABLED } from '../../config/featureFlags';
import { getAccountDeletionState, subscribeAccountDeletion } from '../../../../../src/lib/accountDeletionReceipt';

const AccountDeletionRecovery = lazy(() => import('../../../../../src/components/auth/AccountDeletionRecovery'));

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading, error } = useAuth();
  const [deletion, setDeletion] = useState(getAccountDeletionState);
  useEffect(() => subscribeAccountDeletion(() => setDeletion(getAccountDeletionState())), []);
  const deletionRoute = new URLSearchParams(window.location.search).get('accountDeletion') === 'retry';
  if (deletionRoute || (deletion.pending && (!user || user.id === deletion.pending.userId))) {
    return <Suspense fallback={<div role="status" className="p-6">Opening account deletion…</div>}><AccountDeletionRecovery /></Suspense>;
  }
  const isReconnecting = error?.startsWith('Still reconnecting');
  // Local-only visual QA escape hatch for previewing Entertainment surfaces without test credentials.
  const isLocalEntertainmentPreview = typeof window !== 'undefined'
    && (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
    && ['shado-tv', 'shadow-mystery', 'shadow-runner', ...(SHADOW_CIRCUIT_ENABLED ? ['shadow-circuit'] : [])].includes(new URLSearchParams(window.location.search).get('localPreview') ?? '');

  if (isLocalEntertainmentPreview) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[radial-gradient(circle_at_top,rgba(215,170,70,0.08),transparent_30%),linear-gradient(180deg,var(--bg-shell),var(--bg-app))]">
        <div className="glass-panel-strong max-w-sm space-y-3 rounded-[var(--radius-xl)] px-10 py-9 text-center">
          <div className="flex justify-center">
            <LoadingSpinner size="lg" className="text-[var(--text-gold)]" />
          </div>
          <p className="text-lg font-medium text-[var(--text-primary)]">Loading Shado...</p>
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
