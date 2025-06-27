import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { LoginForm } from './LoginForm';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading, error } = useAuth();

  // Log AuthGuard state on every render
  console.log('🛡️ [AUTHGUARD] Render:', {
    hasUser: !!user,
    userId: user?.id,
    username: user?.username,
    loading,
    hasError: !!error,
    errorMessage: error,
    timestamp: new Date().toISOString()
  });

  if (loading) {
    console.log('🛡️ [AUTHGUARD] Showing loading state');
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
    console.log('🛡️ [AUTHGUARD] No user found, showing login form');
    return <LoginForm />;
  }

  console.log('🛡️ [AUTHGUARD] User authenticated, showing children');
  return <>{children}</>;
}
