import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Package } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/format';
import { Alert, Button, Field, Input } from '@/components/ui';

interface LocationState {
  from?: string;
}

export function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Already signed in (e.g. opening /login in a second tab).
  if (isAuthenticated) return <Navigate to="/" replace />;

  const redirectTo = (location.state as LocationState | null)?.from ?? '/';

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('Enter both your username and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(username.trim(), password);
      // Drop any data cached by the previous session before rendering the app.
      queryClient.clear();
      navigate(redirectTo, { replace: true });
    } catch (cause) {
      setError(errorMessage(cause, 'Could not sign in. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-900">
      {/* Brand panel — hidden on phones where the form needs the full width. */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden p-12 lg:flex">
        <div
          className="absolute inset-0 opacity-90"
          style={{
            background:
              'radial-gradient(circle at 20% 20%, #1e40af 0%, transparent 55%), radial-gradient(circle at 80% 70%, #0f766e 0%, transparent 50%)',
          }}
          aria-hidden
        />
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white backdrop-blur">
            <Package className="h-6 w-6" />
          </span>
          <span className="text-xl font-semibold text-white">Stockwise</span>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-4xl font-semibold leading-tight text-white">
            Every unit, accounted for.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-blue-100/80">
            Track products, stock levels and warehouse movements across your whole operation — with a
            full audit trail behind every change.
          </p>
          <dl className="mt-10 grid grid-cols-3 gap-6">
            {[
              { value: 'Live', label: 'stock levels' },
              { value: 'Multi', label: 'warehouse' },
              { value: 'Full', label: 'audit trail' },
            ].map((item) => (
              <div key={item.label}>
                <dt className="text-2xl font-semibold text-white">{item.value}</dt>
                <dd className="text-xs uppercase tracking-wide text-blue-200/70">{item.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="relative text-xs text-blue-200/50">Inventory Management System</p>
      </div>

      {/* Form panel */}
      <div className="flex w-full items-center justify-center bg-white px-6 py-12 sm:px-12 lg:w-[30rem] lg:shrink-0">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Package className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold text-slate-900">Stockwise</span>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h2>
          <p className="mt-1.5 text-sm text-slate-500">
            Use your inventory team account to continue.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
            {error ? <Alert tone="danger">{error}</Alert> : null}

            <Field label="Username" htmlFor="username" required>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="admin"
                disabled={isSubmitting}
              />
            </Field>

            <Field label="Password" htmlFor="password" required>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                disabled={isSubmitting}
              />
            </Field>

            <Button type="submit" className="w-full" loading={isSubmitting}>
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>

            {isLoading ? (
              <p className="flex items-center justify-center gap-2 text-xs text-slate-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                Restoring your session…
              </p>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}