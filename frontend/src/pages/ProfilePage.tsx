import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, Mail, Package, ShieldCheck, User } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/ToastProvider';
import { formatDateTime, humanize, initials } from '@/lib/format';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
} from '@/components/ui';

export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const changePassword = useMutation({
    mutationFn: () =>
      api.post('/api/v1/auth/change-password', {
        currentPassword,
        newPassword,
      }),
    onSuccess: async () => {
      toast.success('Password changed');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError('');
      // The token payload carries no password state, but refreshing keeps the
      // profile panel consistent if anything else changed meanwhile.
      await refreshUser();
    },
    onError: (cause) => setError(cause.message || 'Could not change your password'),
  });

  const handleSubmit = () => {
    if (!currentPassword) {
      setError('Enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      setError('The new password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('The new password must be different from the current one.');
      return;
    }
    setError('');
    changePassword.mutate();
  };

  return (
    <div className="space-y-5">
      <PageHeader title="My profile" description="Your account details and sign-in security" />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xl font-semibold text-white">
              {initials(user?.fullName ?? user?.username)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-slate-900">
                {user?.fullName ?? 'Account'}
              </p>
              <p className="truncate text-sm text-slate-500">@{user?.username}</p>
            </div>
          </div>

          <dl className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-sm">
            <div className="flex items-start gap-2.5">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0">
                <dt className="text-xs text-slate-500">Email</dt>
                <dd className="truncate text-slate-800">{user?.email}</dd>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0">
                <dt className="text-xs text-slate-500">Role</dt>
                <dd className="text-slate-800">{humanize(user?.role)}</dd>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0">
                <dt className="text-xs text-slate-500">Permissions</dt>
                <dd className="text-slate-800">{user?.permissions.length ?? 0} granted</dd>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <User className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0">
                <dt className="text-xs text-slate-500">Last sign-in</dt>
                <dd className="text-slate-800">
                  {user?.lastLogin ? formatDateTime(user.lastLogin) : 'This is your first session'}
                </dd>
              </div>
            </div>
          </dl>
        </Card>

        <Card className="lg:col-span-2" padded={false}>
          <CardHeader
            title="Change password"
            description="Choose something at least 8 characters long that you do not reuse elsewhere"
          />
          <div className="space-y-4 p-5">
            {error ? <Alert tone="danger">{error}</Alert> : null}

            <Field label="Current password" htmlFor="current-password" required>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="New password" htmlFor="new-password" required>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </Field>
              <Field label="Confirm new password" htmlFor="confirm-password" required>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </Field>
            </div>

            <Button onClick={handleSubmit} loading={changePassword.isPending}>
              Update password
            </Button>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-slate-100 p-2.5 text-slate-500">
            <Package className="h-5 w-5" />
          </span>
          <div className="text-sm text-slate-600">
            <p className="font-medium text-slate-900">What your role can do</p>
            <p className="mt-1">
              Your access is granted by the <span className="font-medium">{humanize(user?.role)}</span>{' '}
              role and checked by the server on every request. Ask an administrator to change it if
              you need more or less access.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}