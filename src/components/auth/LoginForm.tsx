import React, { useState } from 'react';
import { MessageSquare, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import toast from 'react-hot-toast';

export function LoginForm() {
  console.log('🔐 [LOGINFORM] Component render started:', {
    timestamp: new Date().toISOString(),
    location: window.location.href
  });

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
    console.log('🔐 [LOGINFORM] handleSubmit: Form submission triggered', {
      isLogin,
      email: formData.email,
      hasPassword: !!formData.password,
      eventType: e.type,
      eventTarget: e.target,
      timestamp: new Date().toISOString()
    });

    e.preventDefault();
    setErrors({});

    try {
      if (isLogin) {
        console.log('🔐 [LOGINFORM] handleSubmit: Attempting sign in');
        await signIn(formData.email, formData.password);
        console.log('🔐 [LOGINFORM] handleSubmit: Sign in successful');
        toast.success('Welcome back!');
      } else {
        console.log('🔐 [LOGINFORM] handleSubmit: Attempting sign up');
        // Validate signup fields
        const newErrors: Record<string, string> = {};
        if (!formData.full_name.trim()) newErrors.full_name = 'Full name is required';
        if (!formData.username.trim()) newErrors.username = 'Username is required';
        if (formData.username.length < 3) newErrors.username = 'Username must be at least 3 characters';
        
        if (Object.keys(newErrors).length > 0) {
          setErrors(newErrors);
          console.log('🔐 [LOGINFORM] handleSubmit: Validation errors found:', newErrors);
          return;
        }

        const result = await signUp(formData.email, formData.password, {
          full_name: formData.full_name,
          username: formData.username,
        });
        
        if (result.session) {
          console.log('🔐 [LOGINFORM] handleSubmit: Sign up successful with session');
          toast.success('Account created! Welcome to the chat!');
        } else {
          console.log('🔐 [LOGINFORM] handleSubmit: Sign up successful, email confirmation required');
          toast.success('Account created! Please check your email to confirm your account.');
        }
      }
    } catch (error: any) {
      console.error('🔐 [LOGINFORM] handleSubmit: Error occurred:', error);
      toast.error(error.message || 'An error occurred');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('🔐 [LOGINFORM] handleInputChange:', {
      fieldName: e.target.name,
      fieldValue: e.target.value,
      timestamp: new Date().toISOString()
    });

    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  // Log when component state changes
  React.useEffect(() => {
    console.log('🔐 [LOGINFORM] State change:', {
      isLogin,
      formData: {
        email: formData.email,
        hasPassword: !!formData.password,
        full_name: formData.full_name,
        username: formData.username
      },
      loading,
      hasErrors: Object.keys(errors).length > 0,
      timestamp: new Date().toISOString()
    });
  }, [isLogin, formData, loading, errors]);

  // Log when component mounts/unmounts
  React.useEffect(() => {
    console.log('🔐 [LOGINFORM] Component mounted');
    return () => {
      console.log('🔐 [LOGINFORM] Component unmounting');
    };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 space-y-6">
          {/* Header */}
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl">
                <MessageSquare className="w-8 h-8 text-white" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isLogin ? 'Welcome Back' : 'Join the Chat'}
            </h1>
            <p className="text-gray-600 mt-2">
              {isLogin 
                ? 'Sign in to continue your conversations' 
                : 'Create an account to start chatting'
              }
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <Input
                  label="Full Name"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleInputChange}
                  error={errors.full_name}
                  placeholder="Enter your full name"
                  required
                  autoComplete="name"
                />
                
                <Input
                  label="Username"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  error={errors.username}
                  placeholder="Choose a username"
                  required
                  autoComplete="username"
                />
              </>
            )}
            
            <Input
              label="Email"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              error={errors.email}
              placeholder="Enter your email"
              required
              autoComplete="email"
            />
            
            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                error={errors.password}
                placeholder="Enter your password"
                required
                autoComplete={isLogin ? "current-password" : "new-password"}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-8 text-gray-400 hover:text-gray-600"
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
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
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
  );
}
