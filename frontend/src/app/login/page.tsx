'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { login as apiLogin } from '@/lib/api';
import { Activity, Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// Deterministic pseudo-random function to prevent hydration mismatches
const pseudoRandom = (n: number) => {
  return Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1;
};

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('registered') === 'true') {
      setSuccessMsg('Account created successfully! Please sign in.');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await apiLogin(email, password);
      login(result.token, result.user);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-svh w-full flex-col items-center justify-center overflow-hidden bg-background">
      {/* Subtle background gradient */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      {/* Floating particles / dots effect */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute h-1 w-1 rounded-full bg-primary/10"
            style={{
              left: `${pseudoRandom(i * 1.1) * 100}%`,
              top: `${pseudoRandom(i * 2.2) * 100}%`,
              animationDelay: `${pseudoRandom(i * 3.3) * 5}s`,
              animationDuration: `${3 + pseudoRandom(i * 4.4) * 4}s`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 flex w-full flex-col items-center justify-center px-4 py-12 sm:px-6">
        {/* Logo / Brand */}
        <div className="mb-8 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary shadow-lg shadow-primary/20">
            <Activity className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-semibold tracking-tight text-foreground">
            TelemetryHub
          </span>
        </div>

        {/* Card */}
        <div className="w-full max-w-[420px]">
          <div className="rounded-2xl border border-border/60 bg-card/80 p-8 shadow-xl shadow-black/5 backdrop-blur-sm sm:p-10">
            {/* Header */}
            <div className="mb-8 text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Welcome back
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Sign in to access your telemetry dashboard
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="text-sm font-medium text-foreground"
                >
                  Email
                </label>
                <div className="relative">
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    className={cn(
                      'w-full rounded-lg border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-all duration-200',
                      focusedField === 'email'
                        ? 'border-primary/50 ring-2 ring-primary/10'
                        : 'border-border hover:border-border/80'
                    )}
                    required
                    placeholder="admin@telemetryhub.local"
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="text-sm font-medium text-foreground"
                  >
                    Password
                  </label>
                  {/* <Link
                    href="#"
                    className="text-xs text-muted-foreground transition-colors hover:text-primary"
                  >
                    Forgot password?
                  </Link> */}
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    className={cn(
                      'w-full rounded-lg border bg-background px-4 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-all duration-200',
                      focusedField === 'password'
                        ? 'border-primary/50 ring-2 ring-primary/10'
                        : 'border-border hover:border-border/80'
                    )}
                    required
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-lg bg-destructive/10 px-3 py-2.5 text-center text-sm text-destructive">
                  {error}
                </div>
              )}

              {/* Success */}
              {successMsg && (
                <div className="rounded-lg bg-emerald-500/10 px-3 py-2.5 text-center text-sm text-emerald-400">
                  {successMsg}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className={cn(
                  'group flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-all duration-200',
                  isLoading
                    ? 'cursor-not-allowed opacity-70'
                    : 'hover:bg-primary/90 hover:shadow-primary/30 active:scale-[0.98]'
                )}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>

            {/* Footer */}
            <p className="mt-8 text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{' '}
              <Link
                href="/register"
                className="font-medium text-primary transition-colors hover:text-primary/80"
              >
                Create one
              </Link>
            </p>
          </div>

          {/* Footer links */}
          <div className="mt-6 flex items-center justify-center gap-4 text-xs text-muted-foreground/60">
            <span>© 2026 TelemetryHub</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}