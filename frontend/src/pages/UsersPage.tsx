import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api, normalizeList } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/ToastProvider';
import { formatDateTime, humanize } from '@/lib/format';
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
} from '@/components/ui';
import { DataTable, Pagination, type Column } from '@/components/DataTable';
import { ConfirmDialog, type ConfirmRequest } from '@/components/feedback';
import { StatusBadge } from '@/components/StatusBadge';
import type { Role, UserSummary, Warehouse } from '@/types';

const STATUS_OPTIONS = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_APPROVAL'];

interface FormState {
  username: string;
  email: string;
  fullName: string;
  password: string;
  roleId: string;
  warehouseId: string;
  status: string;
}

const EMPTY_FORM: FormState = {
  username: '',
  email: '',
  fullName: '',
  password: '',
  roleId: '',
  warehouseId: '',
  status: 'ACTIVE',
};

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const searchTimer = useRef<number>();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleId, setRoleId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const users = useQuery({
    queryKey: ['users', 'list', debouncedSearch, roleId, status, page, limit],
    queryFn: () =>
      api.get<unknown>('/api/v1/users', {
        page,
        limit,
        search: debouncedSearch || undefined,
        roleId: roleId || undefined,
        status: status || undefined,
      }),
  });

  const roles = useQuery({
    queryKey: ['roles', 'all'],
    queryFn: () => api.get<Role[]>('/api/v1/roles'),
  });

  const warehouses = useQuery({
    queryKey: ['warehouses', 'all'],
    queryFn: () => api.get<unknown>('/api/v1/warehouses', { limit: 100 }),
  });

  const list = normalizeList<UserSummary>(users.data, limit);
  const roleOptions = roles.data ?? [];
  const warehouseOptions = normalizeList<Warehouse>(warehouses.data, 100).items;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['users'] });
    void queryClient.invalidateQueries({ queryKey: ['warehouses'] });
  };

  const createUser = useMutation({
    mutationFn: (payload: FormState) =>
      api.post('/api/v1/auth/register/admin', {
        username: payload.username,
        email: payload.email,
        fullName: payload.fullName,
        password: payload.password,
        roleId: payload.roleId,
        warehouseId: payload.warehouseId || undefined,
      }),
    onSuccess: () => {
      toast.success('User created');
      setEditingId(null);
      setForm(EMPTY_FORM);
      invalidate();
    },
    onError: (error) => setFormError(error.message || 'Could not create the user'),
  });

  const updateUser = useMutation({
    mutationFn: (payload: FormState & { status?: string }) =>
      api.put(`/api/v1/users/${editingId}`, {
        fullName: payload.fullName,
        email: payload.email,
        roleId: payload.roleId,
        warehouseId: payload.warehouseId || null,
        status: payload.status,
      }),
    onSuccess: () => {
      toast.success('User updated');
      setEditingId(null);
      setForm(EMPTY_FORM);
      invalidate();
    },
    onError: (error) => setFormError(error.message || 'Could not update the user'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/users/${id}`),
    onSuccess: () => {
      toast.success('User deleted');
      invalidate();
    },
    onError: (error) => toast.error(error, 'Could not delete the user'),
  });

  const scheduleSearch = (value: string) => {
    setSearch(value);
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
  };

  const handleSubmit = () => {
    if (!editingId) {
      if (!form.username.trim()) {
        setFormError('Username is required.');
        return;
      }
      if (!form.fullName.trim()) {
        setFormError('Full name is required.');
        return;
      }
      if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
        setFormError('Enter a valid email address.');
        return;
      }
      if (form.password.length < 8) {
        setFormError('Password must be at least 8 characters.');
        return;
      }
      if (!form.roleId) {
        setFormError('Choose a role.');
        return;
      }
      setFormError('');
      createUser.mutate(form);
      return;
    }

    if (!form.fullName.trim()) {
      setFormError('Full name is required.');
      return;
    }
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setFormError('Enter a valid email address.');
      return;
    }
    setFormError('');
    updateUser.mutate(form);
  };

  const columns: Array<Column<UserSummary>> = [
    {
      key: 'name',
      header: 'User',
      render: (user) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{user.fullName}</p>
          <p className="truncate text-xs text-slate-500">
            {user.username} · {user.email}
          </p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (user) => (
        <span className="text-sm text-slate-700">{humanize(user.role?.name ?? '')}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (user) => (
        <div>
          <StatusBadge status={user.status} />
          {!user.isActive ? (
            <p className="mt-0.5 text-[11px] text-slate-400">Deactivated</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'lastLogin',
      header: 'Last sign-in',
      secondary: true,
      render: (user) => (
        <span className="whitespace-nowrap text-xs text-slate-500">
          {user.lastLogin ? formatDateTime(user.lastLogin) : 'Never'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'text-right',
      className: 'text-right',
      render: (user) => {
        // The backend refuses to delete your own account; hide the control
        // rather than letting the user trigger a guaranteed failure.
        const isSelf = user.id === currentUser?.id;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditingId(user.id);
                setForm({
                  username: user.username,
                  email: user.email,
                  fullName: user.fullName,
                  password: '',
                  roleId: user.roleId,
                  warehouseId: user.warehouseId ?? '',
                  status: user.status,
                });
                setFormError('');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              aria-label={`Edit ${user.fullName}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {!isSelf ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:bg-red-50"
                onClick={() =>
                  setConfirm({
                    title: 'Delete user',
                    message: `Permanently delete "${user.fullName}"? Their audit history stays, but their account and sessions are removed.`,
                    confirmLabel: 'Delete user',
                    destructive: true,
                    onConfirm: async () => {
                      await remove.mutateAsync(user.id);
                      setConfirm(null);
                    },
                  })
                }
                aria-label={`Delete ${user.fullName}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users"
        description={`${list.total} account${list.total === 1 ? '' : 's'}`}
      />

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-slate-900">
          {editingId ? `Editing ${form.fullName}` : 'Create a user'}
        </h2>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {!editingId ? (
              <Field label="Username" htmlFor="user-username" required>
                <Input
                  id="user-username"
                  value={form.username}
                  onChange={(event) => setForm({ ...form, username: event.target.value })}
                  placeholder="jsmith"
                />
              </Field>
            ) : null}
            <Field label="Full name" htmlFor="user-fullname" required>
              <Input
                id="user-fullname"
                value={form.fullName}
                onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                placeholder="Jane Smith"
              />
            </Field>
            <Field label="Email" htmlFor="user-email" required>
              <Input
                id="user-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="jane@company.com"
              />
            </Field>
            {!editingId ? (
              <Field label="Password" htmlFor="user-password" required hint="Minimum 8 characters">
                <Input
                  id="user-password"
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                />
              </Field>
            ) : null}
            <Field label="Role" htmlFor="user-role" required>
              <Select
                id="user-role"
                value={form.roleId}
                onChange={(event) => setForm({ ...form, roleId: event.target.value })}
              >
                <option value="">Select a role</option>
                {roleOptions.map((role) => (
                  <option key={role.id} value={role.id}>
                    {humanize(role.name)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Warehouse" htmlFor="user-warehouse">
              <Select
                id="user-warehouse"
                value={form.warehouseId}
                onChange={(event) => setForm({ ...form, warehouseId: event.target.value })}
              >
                <option value="">No assigned warehouse</option>
                {warehouseOptions.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </Select>
            </Field>
            {editingId ? (
              <Field label="Account status" htmlFor="user-status">
                <Select
                  id="user-status"
                  value={STATUS_OPTIONS.includes(form.status ?? '') ? form.status : 'ACTIVE'}
                  onChange={(event) => setForm({ ...form, status: event.target.value })}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {humanize(option)}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>

          {formError ? <Alert tone="danger">{formError}</Alert> : null}

          <div className="flex gap-2">
            <Button
              icon={<Plus className="h-4 w-4" />}
              onClick={handleSubmit}
              loading={createUser.isPending || updateUser.isPending}
            >
              {editingId ? 'Save changes' : 'Create user'}
            </Button>
            {editingId ? (
              <Button variant="secondary" onClick={resetForm}>
                Cancel edit
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      <Card padded={false}>
        <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-3">
          <Field label="Search" className="sm:col-span-1">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="Name, username or email…"
                value={search}
                onChange={(event) => {
                  scheduleSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
          </Field>
          <Field label="Role">
            <Select
              value={roleId}
              onChange={(event) => {
                setRoleId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All roles</option>
              {roleOptions.map((role) => (
                <option key={role.id} value={role.id}>
                  {humanize(role.name)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {humanize(option)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <DataTable
          columns={columns}
          rows={list.items}
          rowKey={(user) => user.id}
          isLoading={users.isLoading}
          error={users.error}
          emptyTitle="No users found"
          emptyDescription="Adjust the filters or create a new account."
        />

        {list.total > 0 ? (
          <Pagination
            page={page}
            limit={limit}
            total={list.total}
            onPageChange={setPage}
            onLimitChange={(value) => {
              setLimit(value);
              setPage(1);
            }}
          />
        ) : null}
      </Card>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.confirmLabel}
        destructive={confirm?.destructive}
        onConfirm={confirm?.onConfirm ?? (() => undefined)}
        isConfirming={remove.isPending}
        error={remove.error}
      />
    </div>
  );
}