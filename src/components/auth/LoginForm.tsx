import React, { useEffect, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, MailCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

type AuthView = 'login' | 'signup' | 'verify-pending' | 'forgot-password' | 'reset-password';
type AuthFlow = 'login' | 'signup' | 'verification' | 'forgot-password' | 'reset-password';

const RESEND_COOLDOWN_SECONDS = 60;
const GENERIC_INVITE_FAILURE_MESSAGE = 'Invalid or expired invite code.';

const getRawErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return '';
};

const clearRecoveryUrlState = () => {
  if (typeof window === 'undefined') {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete('auth');
  url.searchParams.delete('type');
  url.searchParams.delete('code');
  url.hash = '';
  window.history.replaceState({}, '', `${url.pathname}${url.search}`);
};

export function LoginForm() {
  const [view, setView] = useState<AuthView>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState('');
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [formData, setFormData] = useState({
    inviteCode: '',
    displayName: '',
    username: '',
    email: '',
    password: '',
    resetPassword: '',
    resetPasswordConfirm: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const {
    signIn,
    signUp,
    resendVerificationEmail,
    sendPasswordReset,
    updatePasswordAfterRecovery,
    passwordRecovery,
    loading,
    error: authError,
  } = useAuth();

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
    const verified =
      url.searchParams.get('auth') === 'verified' ||
      url.searchParams.get('type') === 'signup' ||
      hashParams.get('auth') === 'verified' ||
      hashParams.get('type') === 'signup';

    if (verified) {
      setView('login');
      setStatusMessage('Email verified. Sign in to continue.');
    }
  }, []);

  useEffect(() => {
    if (passwordRecovery) {
      setView('reset-password');
      setSubmitError(null);
      setErrors({});
    }
  }, [passwordRecovery]);

  useEffect(() => {
    if (resendCooldown <= 0) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setResendCooldown(current => Math.max(current - 1, 0));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  const getAuthErrorMessage = (error: unknown, flow: AuthFlow) => {
    const message = getRawErrorMessage(error);

    if (/exceed_(cached_)?egress_quota|project is restricted|status\s*402|payment required/i.test(message)) {
      return 'ShadowChat is temporarily blocked by the backend usage quota. An admin needs to restore Supabase service, then login will work again.';
    }

    if (flow === 'signup') {
      if (/username.*taken|username.*available/i.test(message)) {
        return 'That username is already taken.';
      }

      if (/already.*registered|already.*email|user already/i.test(message)) {
        return 'That email may already have an account. Sign in or reset your password.';
      }

      if (/password/i.test(message)) {
        return 'Use a stronger password and try again.';
      }

      if (/email/i.test(message) && !/invite/i.test(message)) {
        return 'Enter a valid email address and try again.';
      }

      return GENERIC_INVITE_FAILURE_MESSAGE;
    }

    if (flow === 'login') {
      if (/email.*confirm|confirm.*email|not confirmed/i.test(message)) {
        return 'Check your email to verify your account before signing in.';
      }

      if (/invalid login|invalid credentials/i.test(message)) {
        return 'Email or password is incorrect.';
      }

      return message || 'Sign in failed. Please try again.';
    }

    if (flow === 'verification') {
      return message || 'We could not send another verification email. Try again in a minute.';
    }

    if (flow === 'forgot-password') {
      return message || 'Password reset email failed. Please try again.';
    }

    return message || 'Password update failed. Please try again.';
  };

  const startResendCooldown = () => {
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
  };

  const resetTransientState = () => {
    setErrors({});
    setSubmitError(null);
    setStatusMessage(null);
    setResetEmailSent(false);
  };

  const switchView = (nextView: AuthView) => {
    resetTransientState();
    setView(nextView);
  };

  const validateSignup = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.inviteCode.trim()) newErrors.inviteCode = 'Invite code is required';
    if (!formData.displayName.trim()) newErrors.displayName = 'Display name is required';
    if (!formData.username.trim()) newErrors.username = 'Username is required';
    if (formData.username.trim().length > 0 && formData.username.trim().length < 3) {
      newErrors.username = 'Username must be at least 3 characters';
    }
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    if (formData.password.length < 6) newErrors.password = 'Password must be at least 6 characters';
    return newErrors;
  };

  const validateResetPassword = () => {
    const newErrors: Record<string, string> = {};
    if (formData.resetPassword.length < 6) {
      newErrors.resetPassword = 'Password must be at least 6 characters';
    }
    if (formData.resetPasswordConfirm !== formData.resetPassword) {
      newErrors.resetPasswordConfirm = 'Passwords must match';
    }
    return newErrors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setSubmitError(null);
    setStatusMessage(null);

    try {
      if (view === 'login') {
        await signIn(formData.email.trim(), formData.password);
        toast.success('Welcome back.');
        return;
      }

      if (view === 'signup') {
        const newErrors = validateSignup();
        if (Object.keys(newErrors).length > 0) {
          setErrors(newErrors);
          return;
        }

        const result = await signUp(formData.email.trim(), formData.password, {
          inviteCode: formData.inviteCode,
          displayName: formData.displayName,
          username: formData.username,
        });

        if (result.session) {
          toast.success('Account created.');
          return;
        }

        setPendingVerificationEmail(formData.email.trim());
        setView('verify-pending');
        startResendCooldown();
        toast.success('Check your email to verify your account.');
        return;
      }

      if (view === 'forgot-password') {
        if (!formData.email.trim()) {
          setErrors({ email: 'Email is required' });
          return;
        }

        await sendPasswordReset(formData.email.trim());
        setResetEmailSent(true);
        toast.success('If that email is registered, a reset link is on the way.');
        return;
      }

      if (view === 'reset-password') {
        const newErrors = validateResetPassword();
        if (Object.keys(newErrors).length > 0) {
          setErrors(newErrors);
          return;
        }

        await updatePasswordAfterRecovery(formData.resetPassword);
        clearRecoveryUrlState();
        setFormData(prev => ({
          ...prev,
          password: '',
          resetPassword: '',
          resetPasswordConfirm: '',
        }));
        setView('login');
        toast.success('Password updated. Sign in with your new password.');
      }
    } catch (error: unknown) {
      const flow: AuthFlow =
        view === 'signup'
          ? 'signup'
          : view === 'forgot-password'
            ? 'forgot-password'
            : view === 'reset-password'
              ? 'reset-password'
              : 'login';
      const message = getAuthErrorMessage(error, flow);
      setSubmitError(message);
      toast.error(message, { duration: 7000 });
    }
  };

  const handleResendVerification = async () => {
    const email = pendingVerificationEmail || formData.email.trim();
    if (!email || resendCooldown > 0) {
      return;
    }

    setSubmitError(null);
    try {
      await resendVerificationEmail(email);
      startResendCooldown();
      toast.success('Verification email sent.');
    } catch (error: unknown) {
      const message = getAuthErrorMessage(error, 'verification');
      setSubmitError(message);
      toast.error(message, { duration: 7000 });
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
    if (submitError) {
      setSubmitError(null);
    }
  };

  const visibleError =
    submitError ||
    (authError
      ? getAuthErrorMessage(
          new Error(authError),
          view === 'signup'
            ? 'signup'
            : view === 'forgot-password'
              ? 'forgot-password'
              : view === 'reset-password'
                ? 'reset-password'
                : 'login'
        )
      : null);

  const title = (() => {
    if (view === 'signup') return 'Create account';
    if (view === 'verify-pending') return 'Verify your email';
    if (view === 'forgot-password') return 'Reset password';
    if (view === 'reset-password') return 'Set new password';
    return 'Sign in';
  })();

  const subtitle = (() => {
    if (view === 'signup') return 'Invite code required.';
    if (view === 'verify-pending') return 'Confirmation is required before sign in.';
    if (view === 'forgot-password') return 'We will send a secure reset link.';
    if (view === 'reset-password') return 'Enter a new password for your account.';
    return 'Access your Shado account.';
  })();

  const renderModeSwitch = view === 'login' || view === 'signup';

  return (
    <div className="theme-page-surface relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-8">
      <div className="relative w-full max-w-[26rem]">
        <div className="glass-panel-strong space-y-6 rounded-[var(--radius-xl)] p-7 shadow-[var(--shadow-panel)] sm:p-8">
          <div className="space-y-4 text-center">
            <div className="flex justify-center">
              <img
                src="/icons/header-logo.png"
                alt="SHADO"
                className="theme-logo h-20 w-56 object-contain"
              />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{title}</h1>
              <p className="text-sm leading-6 text-[var(--text-secondary)]">{subtitle}</p>
            </div>
          </div>

          {renderModeSwitch && (
            <div className="grid grid-cols-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-1">
              <button
                type="button"
                onClick={() => switchView('login')}
                className={`rounded-[calc(var(--radius-sm)-2px)] px-3 py-2 text-sm font-medium transition-colors ${
                  view === 'login'
                    ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => switchView('signup')}
                className={`rounded-[calc(var(--radius-sm)-2px)] px-3 py-2 text-sm font-medium transition-colors ${
                  view === 'signup'
                    ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                Sign up
              </button>
            </div>
          )}

          {visibleError && (
            <div className="rounded-[var(--radius-md)] border border-[rgba(180,90,99,0.34)] bg-[rgba(180,90,99,0.12)] px-4 py-3 text-sm leading-6 text-[var(--text-primary)]">
              {visibleError}
            </div>
          )}

          {statusMessage && !visibleError && (
            <div className="rounded-[var(--radius-md)] border border-[var(--theme-accent-border-soft)] bg-[var(--theme-accent-soft)] px-4 py-3 text-sm leading-6 text-[var(--text-primary)]">
              {statusMessage}
            </div>
          )}

          {view === 'verify-pending' ? (
            <div className="space-y-5 text-center">
              <div className="flex justify-center text-[var(--theme-accent-readable)]">
                <MailCheck className="h-10 w-10" aria-hidden="true" />
              </div>
              <p className="text-sm leading-6 text-[var(--text-secondary)]">
                We sent a confirmation link to{' '}
                <span className="font-medium text-[var(--text-primary)]">
                  {pendingVerificationEmail || formData.email}
                </span>
                .
              </p>
              <div className="space-y-3">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  disabled={loading || resendCooldown > 0}
                  onClick={handleResendVerification}
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend verification'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => switchView('login')}
                >
                  Back to sign in
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {view === 'signup' && (
                <>
                  <Input
                    label="Invite code"
                    name="inviteCode"
                    autoComplete="one-time-code"
                    value={formData.inviteCode}
                    onChange={handleInputChange}
                    error={errors.inviteCode}
                    placeholder="Enter your invite code"
                    required
                  />

                  <Input
                    label="Display name"
                    name="displayName"
                    autoComplete="name"
                    value={formData.displayName}
                    onChange={handleInputChange}
                    error={errors.displayName}
                    placeholder="Name shown in chat"
                    required
                  />

                  <Input
                    label="Username"
                    name="username"
                    autoComplete="username"
                    value={formData.username}
                    onChange={handleInputChange}
                    error={errors.username}
                    placeholder="Choose a username"
                    required
                  />
                </>
              )}

              {(view === 'login' || view === 'signup' || view === 'forgot-password') && (
                <Input
                  label="Email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  error={errors.email}
                  placeholder="Enter your email"
                  required
                />
              )}

              {(view === 'login' || view === 'signup') && (
                <div className="relative">
                  <Input
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete={view === 'login' ? 'current-password' : 'new-password'}
                    value={formData.password}
                    onChange={handleInputChange}
                    error={errors.password}
                    placeholder="Enter your password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(current => !current)}
                    className="absolute right-3 top-8 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              )}

              {view === 'reset-password' && (
                <>
                  <div className="relative">
                    <Input
                      label="New password"
                      type={showPassword ? 'text' : 'password'}
                      name="resetPassword"
                      autoComplete="new-password"
                      value={formData.resetPassword}
                      onChange={handleInputChange}
                      error={errors.resetPassword}
                      placeholder="Enter a new password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(current => !current)}
                      className="absolute right-3 top-8 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>

                  <Input
                    label="Confirm password"
                    type={showPassword ? 'text' : 'password'}
                    name="resetPasswordConfirm"
                    autoComplete="new-password"
                    value={formData.resetPasswordConfirm}
                    onChange={handleInputChange}
                    error={errors.resetPasswordConfirm}
                    placeholder="Confirm the new password"
                    required
                  />
                </>
              )}

              {view === 'forgot-password' && resetEmailSent && (
                <div className="rounded-[var(--radius-md)] border border-[var(--theme-accent-border-soft)] bg-[var(--theme-accent-soft)] px-4 py-3 text-sm leading-6 text-[var(--text-primary)]">
                  If that email is registered, a reset link is on the way.
                </div>
              )}

              <Button type="submit" loading={loading} className="w-full" size="lg">
                {view === 'signup'
                  ? 'Create account'
                  : view === 'forgot-password'
                    ? 'Send reset link'
                    : view === 'reset-password'
                      ? 'Update password'
                      : 'Sign in'}
              </Button>

              {view === 'login' && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => switchView('forgot-password')}
                    className="text-sm font-medium text-[var(--theme-accent-readable)] transition-colors hover:text-[var(--theme-accent-strong)]"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {(view === 'forgot-password' || view === 'reset-password') && (
                <button
                  type="button"
                  onClick={() => {
                    if (view === 'reset-password') {
                      clearRecoveryUrlState();
                    }
                    switchView('login');
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back to sign in
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
