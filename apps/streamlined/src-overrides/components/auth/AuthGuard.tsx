import React, { lazy, Suspense, useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { StreamlinedLoadingView } from '../../../../../src/streamlined/components/StreamlinedLoadingView';
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
    return <Suspense fallback={<StreamlinedLoadingView fullscreen message="Opening account deletion…" />}><AccountDeletionRecovery /></Suspense>;
  }
  // Local-only visual QA escape hatch for previewing Entertainment surfaces without test credentials.
  const isLocalEntertainmentPreview = typeof window !== 'undefined'
    && (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
    && ['shado-tv', 'shadow-mystery', 'shadow-runner', ...(SHADOW_CIRCUIT_ENABLED ? ['shadow-circuit'] : [])].includes(new URLSearchParams(window.location.search).get('localPreview') ?? '');

  if (isLocalEntertainmentPreview) {
    return <>{children}</>;
  }

  if (loading) {
    return <StreamlinedLoadingView fullscreen error={error} />;
  }

  if (!user) {
    return <LoginForm />;
  }

  return <>{children}</>;
}
