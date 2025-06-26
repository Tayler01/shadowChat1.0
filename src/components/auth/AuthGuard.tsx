import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { AuthService } from '../../lib/auth';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { LoginForm } from './LoginForm';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
        <div className="text-center space-y-4">
          <LoadingSpinner size="lg" />
          <div className="space-y-2">
            <p className="text-gray-600">Loading...</p>
            <button
              onClick={() => AuthService.clearAllSessions()}
              className="text-sm text-blue-600 hover:text-blue-700 underline"
            >
              Clear session and reload
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  return <>{children}</>;
}