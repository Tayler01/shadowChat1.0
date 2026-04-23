import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import toast from 'react-hot-toast';

export function LoginForm() {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    username: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { signIn, signUp, loading } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    try {
      if (isLogin) {
        await signIn(formData.email, formData.password);
        toast.success('Welcome back!');
      } else {
        // Validate signup fields
        const newErrors: Record<string, string> = {};
        if (!formData.full_name.trim()) newErrors.full_name = 'Full name is required';
        if (!formData.username.trim()) newErrors.username = 'Username is required';
        if (formData.username.length < 3) newErrors.username = 'Username must be at least 3 characters';
        
        if (Object.keys(newErrors).length > 0) {
          setErrors(newErrors);
          return;
        }

        const result = await signUp(formData.email, formData.password, {
          full_name: formData.full_name,
          username: formData.username,
        });
        
        if (result.session) {
          toast.success('Account created! Welcome to the chat!');
        } else {
          toast.success('Account created! Please check your email to confirm your account.');
        }
      }
    } catch (error: unknown) {
      const err = error as Error | { message?: string };
      toast.error(err.message || 'An error occurred');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,rgba(215,170,70,0.12),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(215,170,70,0.08),transparent_24%),linear-gradient(180deg,var(--bg-shell),var(--bg-app))] px-4">
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:32px_32px]" />
      <div className="relative mx-4 grid w-full max-w-5xl gap-6 lg:grid-cols-[1fr_26rem]">
        <div className="hidden items-end lg:flex">
          <div className="max-w-xl space-y-6 pb-6">
            <div className="space-y-3">
              <img
                src="/icons/header-logo.png"
                alt="SHADO"
                className="h-28 w-80 object-contain object-left"
              />
              <span className="inline-flex rounded-full border border-[rgba(215,170,70,0.16)] bg-[rgba(215,170,70,0.08)] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--text-gold)]">
                Real-time private chat
              </span>
              <h2 className="text-4xl font-semibold leading-tight text-[var(--text-primary)]">
                A sharper, calmer chat workspace for fast conversations.
              </h2>
              <p className="max-w-lg text-base leading-7 text-[var(--text-secondary)]">
                Direct messages, live presence, reactions, uploads, and notifications in one premium dark interface that feels more like a finished product than a demo.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['Realtime', 'Group chat and DMs update live'],
                ['Focused', 'Dense layout with minimal clutter'],
                ['Cross-device', 'Push-ready experience across web and mobile'],
              ].map(([title, copy]) => (
                <div
                  key={title}
                  className="glass-panel rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4"
                >
                  <div className="text-sm font-medium text-[var(--text-primary)]">{title}</div>
                  <div className="mt-1 text-sm text-[var(--text-muted)]">{copy}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative w-full max-w-md lg:justify-self-end">
        <div className="glass-panel-strong space-y-6 rounded-[var(--radius-xl)] p-8">
          {/* Header */}
          <div className="text-center">
            <div className="mb-4 flex justify-center">
              <img
                src="/icons/header-logo.png"
                alt="SHADO"
                className="h-20 w-56 object-contain"
              />
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              {isLogin ? 'Welcome Back' : 'Join the Chat'}
            </h1>
            <p className="mt-2 text-[var(--text-secondary)]">
              {isLogin 
                ? 'Sign in to continue your conversations' 
                : 'Create an account to start chatting'
              }
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2 lg:hidden">
              <span className="rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Realtime
              </span>
              <span className="rounded-full border border-[rgba(215,170,70,0.16)] bg-[rgba(215,170,70,0.08)] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--text-gold)]">
                Private chat
              </span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <Input
                  label="Full Name"
                  name="full_name"
                  autoComplete="name"
                  value={formData.full_name}
                  onChange={handleInputChange}
                  error={errors.full_name}
                  placeholder="Enter your full name"
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
            
            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                value={formData.password}
                onChange={handleInputChange}
                error={errors.password}
                placeholder="Enter your password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-8 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            <Button
              type="submit"
              loading={loading}
              className="w-full"
              size="lg"
            >
              {isLogin ? 'Sign In' : 'Create Account'}
            </Button>
          </form>

          {/* Toggle */}
          <div className="text-center">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm font-medium text-[var(--text-gold)] transition-colors hover:text-[var(--gold-accent-strong)]"
            >
              {isLogin 
                ? "Don't have an account? Sign up" 
                : 'Already have an account? Sign in'
              }
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
