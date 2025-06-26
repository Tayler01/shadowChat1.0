import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { LoginForm } from './LoginForm';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading, error } = useAuth();

  // Debug auth state
  React.useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('🔐 AuthGuard: Auth state', {
        user: !!user,
        loading,
        error: error || 'none',
        timestamp: new Date().toISOString()
      });
    }
  }, [user, loading, error]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
        <div className="text-center space-y-4">
          <LoadingSpinner size="lg" />
          <p className="text-gray-600">Loading...</p>
          {error && (
            <p className="text-red-600 text-sm">Error: {error}</p>
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