import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderTree, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, normalizeList } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/ToastProvider';
import { errorMessage } from '@/lib/format';
import { Badge, Button, Card, Field, Input, PageHeader, Alert } from '@/components/ui';
import { ConfirmDialog, type ConfirmRequest } from '@/components/feedback';
import { DataTable, type Column } from '@/components/DataTable';
import type { Category } from '@/types';

interface FormState {
  name: string;
  description: string;
  parentId: string;
}

const EMPTY_FORM: FormState = { name: '', description: '', parentId: '' };

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const categories = useQuery({
    queryKey: ['categories', 'all'],
    queryFn: () => api.get<unknown>('/api/v1/categories', { limit: 100 }),
  });

  const list = normalizeList<Category>(categories.data, 100).items;
  const canManage = can('manage_categories');

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
  };

  const openEdit = (category: Category) => {
    setEditingId(category.id);
    setForm({
      name: category.name,
      description: category.description ?? '',
      // A category cannot be its own parent, so the current row is excluded
      // from the options.
      parentId: category.parentId ?? '',
    });
    setFormError('');
  };

  const save = useMutation({
    mutationFn: (payload: Partial<FormState>) =>
      editingId
        ? api.put(`/api/v1/categories/${editingId}`, {
            name: payload.name,
            description: payload.description || undefined,
            parentId: payload.parentId || null,
          })
        : api.post('/api/v1/categories', {
            name: payload.name,
            description: payload.description || undefined,
            parentId: payload.parentId || null,
          }),
    onSuccess: () => {
      toast.success(editingId ? 'Category updated' : 'Category created');
      setEditingId(null);
      setForm(EMPTY_FORM);
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (error) => setFormError(errorMessage(error, 'Could not save the category')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/categories/${id}`),
    onSuccess: () => {
      toast.success('Category deleted');
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error) => toast.error(error, 'Could not delete the category'),
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setFormError('Category name is required.');
      return;
    }
    save.mutate(form);
  };

  const parentName = (parentId: string | null) =>
    parentId ? (list.find((category) => category.id === parentId)?.name ?? '—') : null;

  const columns: Array<Column<Category>> = [
    {
      key: 'name',
      header: 'Category',
      render: (category) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{category.name}</p>
          {category.description ? (
            <p className="truncate text-xs text-slate-500">{category.description}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'parent',
      header: 'Parent',
      secondary: true,
      render: (category) => parentName(category.parentId) ?? <span className="text-slate-400">—</span>,
    },
    {
      key: 'status',
      header: 'Status',
      secondary: true,
      render: (category) => (
        <Badge tone={category.isActive ? 'success' : 'neutral'}>
          {category.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'text-right',
      className: 'text-right',
      render: (category) =>
        canManage ? (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openEdit(category)}
              aria-label={`Edit ${category.name}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:bg-red-50"
              onClick={() =>
                setConfirm({
                  title: 'Delete category',
                  message: `Delete "${category.name}"? Products in this category must be reassigned first.`,
                  confirmLabel: 'Delete category',
                  destructive: true,
                  onConfirm: async () => {
                    await remove.mutateAsync(category.id);
                    setConfirm(null);
                  },
                })
              }
              aria-label={`Delete ${category.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Categories"
        description="Group products so reporting and filtering stay meaningful"
        actions={
          canManage ? (
            <Button
              icon={<Plus className="h-4 w-4" />}
              onClick={() => {
                openCreate();
                document.getElementById('category-form')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              New category
            </Button>
          ) : null
        }
      />

      {canManage ? (
        <Card>
          <form id="category-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Name" htmlFor="category-name" required>
                <Input
                  id="category-name"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Electronics"
                />
              </Field>
              <Field label="Parent category" htmlFor="category-parent">
                <select
                  id="category-parent"
                  className="input"
                  value={form.parentId}
                  onChange={(event) => setForm({ ...form, parentId: event.target.value })}
                >
                  <option value="">None (top level)</option>
                  {list
                    .filter((category) => category.id !== editingId)
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Description" htmlFor="category-description" className="sm:col-span-2 lg:col-span-1">
                <Input
                  id="category-description"
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="Optional"
                />
              </Field>
            </div>

            {formError ? <Alert tone="danger">{formError}</Alert> : null}

            <div className="flex gap-2">
              <Button type="submit" loading={save.isPending}>
                {editingId ? 'Save changes' : 'Add category'}
              </Button>
              {editingId ? (
                <Button type="button" variant="secondary" onClick={openCreate}>
                  Cancel edit
                </Button>
              ) : null}
            </div>
          </form>
        </Card>
      ) : (
        <Alert tone="info">
          You have read-only access to categories. Ask an administrator for the “Manage Categories”
          permission to make changes.
        </Alert>
      )}

      <Card padded={false}>
        <DataTable
          columns={columns}
          rows={list}
          rowKey={(category) => category.id}
          isLoading={categories.isLoading}
          error={categories.error}
          emptyTitle="No categories yet"
          emptyDescription="Create a category to organise your product catalog."
          emptyAction={
            canManage ? (
              <Button
                icon={<FolderTree className="h-4 w-4" />}
                onClick={() => {
                  openCreate();
                  document.getElementById('category-form')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                New category
              </Button>
            ) : null
          }
        />
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