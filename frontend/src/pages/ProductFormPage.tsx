import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save } from 'lucide-react';
import { api, normalizeList } from '@/lib/api';
import { useToast } from '@/lib/ToastProvider';
import { errorMessage } from '@/lib/format';
import { Alert, Button, Card, CardHeader, Field, Input, LoadingBlock, PageHeader, Select, Textarea } from '@/components/ui';
import { UNITS, type Category, type Product, type Supplier, type Warehouse } from '@/types';

interface FormState {
  sku: string;
  barcode: string;
  name: string;
  description: string;
  categoryId: string;
  brand: string;
  unit: string;
  costPrice: string;
  sellingPrice: string;
  minStockLevel: string;
  maxStockLevel: string;
  reorderLevel: string;
  supplierId: string;
  warehouseId: string;
  batchNumber: string;
  serialNumber: string;
  manufacturingDate: string;
  expiryDate: string;
  status: string;
}

const EMPTY_FORM: FormState = {
  sku: '',
  barcode: '',
  name: '',
  description: '',
  categoryId: '',
  brand: '',
  unit: 'PIECE',
  costPrice: '0',
  sellingPrice: '0',
  minStockLevel: '0',
  maxStockLevel: '',
  reorderLevel: '0',
  supplierId: '',
  warehouseId: '',
  batchNumber: '',
  serialNumber: '',
  manufacturingDate: '',
  expiryDate: '',
  status: 'ACTIVE',
};

/** `<input type="date">` needs `yyyy-mm-dd`; the API returns a full ISO string. */
const toDateInput = (value: string | null | undefined): string => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

/** Empty strings must become null, otherwise Prisma rejects "" for a date column. */
const toNullable = (value: string) => (value.trim() === '' ? null : value.trim());

/** Sends null for blank numbers so the column keeps its own default. */
const toNullableNumber = (value: string): number | null =>
  value.trim() === '' ? null : Number(value);

const toNumber = (value: string): number => Number(value) || 0;

export function ProductFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const product = useQuery({
    queryKey: ['products', 'detail', id],
    queryFn: () => api.get<Product>(`/api/v1/products/${id}`),
    enabled: isEdit,
  });

  const categories = useQuery({
    queryKey: ['categories', 'all'],
    queryFn: () => api.get<unknown>('/api/v1/categories'),
  });
  const suppliers = useQuery({
    queryKey: ['suppliers', 'all'],
    queryFn: () => api.get<unknown>('/api/v1/suppliers'),
  });
  const warehouses = useQuery({
    queryKey: ['warehouses', 'all'],
    queryFn: () => api.get<unknown>('/api/v1/warehouses'),
  });

  // Populate the form once the record arrives, then leave it alone so typing
  // is never overwritten by a background refetch.
  useEffect(() => {
    if (!product.data) return;
    const p = product.data;
    setForm({
      sku: p.sku ?? '',
      barcode: p.barcode ?? '',
      name: p.name ?? '',
      description: p.description ?? '',
      categoryId: p.categoryId ?? '',
      brand: p.brand ?? '',
      unit: p.unit ?? 'PIECE',
      costPrice: String(p.costPrice ?? 0),
      sellingPrice: String(p.sellingPrice ?? 0),
      minStockLevel: String(p.minStockLevel ?? 0),
      maxStockLevel: p.maxStockLevel == null ? '' : String(p.maxStockLevel),
      reorderLevel: String(p.reorderLevel ?? 0),
      supplierId: p.supplierId ?? '',
      warehouseId: p.warehouseId ?? '',
      batchNumber: p.batchNumber ?? '',
      serialNumber: p.serialNumber ?? '',
      manufacturingDate: toDateInput(p.manufacturingDate),
      expiryDate: toDateInput(p.expiryDate),
      status: p.status ?? 'ACTIVE',
    });
  }, [product.data]);

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      isEdit ? api.put(`/api/v1/products/${id}`, payload) : api.post('/api/v1/products', payload),
    onSuccess: () => {
      toast.success(isEdit ? 'Product updated' : 'Product created');
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      navigate('/products');
    },
    onError: (error) => toast.error(error, 'Could not save the product'),
  });

  const update = (key: keyof FormState) => (event: { target: { value: string } }) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};

    if (!form.name.trim()) next.name = 'Product name is required.';
    if (!form.sku.trim()) next.sku = 'SKU is required.';
    if (!form.categoryId) next.categoryId = 'Choose a category.';
    if (!form.supplierId) next.supplierId = 'Choose a supplier.';

    if (form.costPrice === '' || Number(form.costPrice) < 0) {
      next.costPrice = 'Enter zero or a positive amount.';
    }
    if (form.sellingPrice === '' || Number(form.sellingPrice) < 0) {
      next.sellingPrice = 'Enter zero or a positive amount.';
    }

    const min = Number(form.minStockLevel || 0);
    const max = form.maxStockLevel === '' ? null : Number(form.maxStockLevel);
    const reorder = Number(form.reorderLevel || 0);

    if (min < 0 || reorder < 0) {
      next.minStockLevel = 'Levels cannot be negative.';
    }
    if (max != null && max < min) {
      next.maxStockLevel = 'Maximum must be greater than or equal to the minimum.';
    }
    if (reorder < min) {
      next.reorderLevel = 'Reorder level should not be below the minimum.';
    }
    if (
      form.manufacturingDate &&
      form.expiryDate &&
      new Date(form.expiryDate) <= new Date(form.manufacturingDate)
    ) {
      next.expiryDate = 'Expiry must be after the manufacturing date.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    mutation.mutate({
      sku: form.sku.trim(),
      barcode: toNullable(form.barcode),
      name: form.name.trim(),
      description: toNullable(form.description),
      categoryId: form.categoryId,
      brand: toNullable(form.brand),
      unit: form.unit,
      costPrice: toNumber(form.costPrice),
      sellingPrice: toNumber(form.sellingPrice),
      minStockLevel: toNumber(form.minStockLevel),
      maxStockLevel: toNullableNumber(form.maxStockLevel),
      reorderLevel: toNumber(form.reorderLevel),
      supplierId: form.supplierId,
      warehouseId: form.warehouseId ? form.warehouseId : null,
      batchNumber: toNullable(form.batchNumber),
      serialNumber: toNullable(form.serialNumber),
      manufacturingDate: toNullable(form.manufacturingDate),
      expiryDate: toNullable(form.expiryDate),
      status: form.status,
    });
  };

  const categoryOptions = normalizeList<Category>(categories.data).items;
  const supplierOptions = normalizeList<Supplier>(suppliers.data).items;
  const warehouseOptions = normalizeList<Warehouse>(warehouses.data).items;

  // Only ACTIVE suppliers can be assigned; pending ones are filtered out
  // server-side on approval, so offering them creates a broken product.
  const activeSuppliers = useMemo(
    () => supplierOptions.filter((supplier) => supplier.status === 'ACTIVE'),
    [supplierOptions],
  );

  if (isEdit && product.isLoading) return <LoadingBlock label="Loading product…" />;

  if (isEdit && product.error) {
    return (
      <div className="space-y-4">
        <Alert tone="danger">{errorMessage(product.error, 'Product not found')}</Alert>
        <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/products')}>
          Back to products
        </Button>
      </div>
    );
  }

  const missingReferences =
    categoryOptions.length === 0 || activeSuppliers.length === 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <PageHeader
        title={isEdit ? 'Edit product' : 'New product'}
        description={
          isEdit ? `Update ${product.data?.name ?? 'this product'}` : 'Add an item to your catalog'
        }
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => navigate('/products')}>
              Cancel
            </Button>
            <Button type="submit" icon={<Save className="h-4 w-4" />} loading={mutation.isPending}>
              {isEdit ? 'Save changes' : 'Create product'}
            </Button>
          </>
        }
      />

      {mutation.error ? <Alert tone="danger">{errorMessage(mutation.error)}</Alert> : null}

      {missingReferences ? (
        <Alert tone="warning" title="Some required lists are empty">
          A product needs one category and one approved supplier.{' '}
          {categoryOptions.length === 0 ? (
            <button
              type="button"
              className="font-medium underline"
              onClick={() => navigate('/categories')}
            >
              Create a category
            </button>
          ) : null}
          {activeSuppliers.length === 0 ? (
            <button
              type="button"
              className="font-medium underline"
              onClick={() => navigate('/suppliers')}
            >
              Approve a supplier
            </button>
          ) : null}
        </Alert>
      ) : null}

      <Card padded={false}>
        <CardHeader title="Identification" description="How this product is recognised across the system" />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Product name" htmlFor="name" required error={errors.name}>
            <Input id="name" value={form.name} onChange={update('name')} invalid={Boolean(errors.name)} placeholder="Wireless barcode scanner" />
          </Field>
          <Field label="SKU" htmlFor="sku" required error={errors.sku} hint="Unique stock keeping unit code">
            <Input id="sku" value={form.sku} onChange={update('sku')} invalid={Boolean(errors.sku)} placeholder="WBS-001" />
          </Field>
          <Field label="Barcode" htmlFor="barcode" hint="EAN, UPC or any scanned code">
            <Input id="barcode" value={form.barcode} onChange={update('barcode')} placeholder="5901234123457" />
          </Field>
          <Field label="Brand" htmlFor="brand">
            <Input id="brand" value={form.brand} onChange={update('brand')} placeholder="Optional" />
          </Field>
          <Field label="Unit of measure" htmlFor="unit">
            <Select id="unit" value={form.unit} onChange={update('unit')}>
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit.toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor="status">
            <Select id="status" value={form.status} onChange={update('status')}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="DISCONTINUED">Discontinued</option>
              <option value="OUT_OF_STOCK">Out of stock</option>
            </Select>
          </Field>
          <Field label="Description" htmlFor="description" className="sm:col-span-2 lg:col-span-3">
            <Textarea
              id="description"
              value={form.description}
              onChange={update('description')}
              rows={2}
              placeholder="Optional notes about this product"
            />
          </Field>
        </div>
      </Card>

      <Card padded={false}>
        <CardHeader title="Classification" description="Where this product sits in the catalog" />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Category" htmlFor="categoryId" required error={errors.categoryId}>
            <Select id="categoryId" value={form.categoryId} onChange={update('categoryId')}>
              <option value="">Select a category</option>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Supplier" htmlFor="supplierId" required error={errors.supplierId}>
            <Select id="supplierId" value={form.supplierId} onChange={update('supplierId')}>
              <option value="">Select a supplier</option>
              {activeSuppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Home warehouse" htmlFor="warehouseId" hint="Where this product is stocked by default">
            <Select id="warehouseId" value={form.warehouseId} onChange={update('warehouseId')}>
              <option value="">No default warehouse</option>
              {warehouseOptions.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card padded={false}>
        <CardHeader title="Pricing & stock levels" description="Used to value stock and trigger low-stock alerts" />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Cost price" htmlFor="costPrice" required error={errors.costPrice}>
            <Input id="costPrice" type="number" step="0.01" min="0" prefix="$" value={form.costPrice} onChange={update('costPrice')} invalid={Boolean(errors.costPrice)} />
          </Field>
          <Field label="Selling price" htmlFor="sellingPrice" required error={errors.sellingPrice}>
            <Input id="sellingPrice" type="number" step="0.01" min="0" prefix="$" value={form.sellingPrice} onChange={update('sellingPrice')} invalid={Boolean(errors.sellingPrice)} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <p className="text-xs text-slate-500">
              Margin per unit:{' '}
              <span className="tabular font-medium text-slate-700">
                $
                {(Number(form.sellingPrice || 0) - Number(form.costPrice || 0)).toFixed(2)}
              </span>
            </p>
          </div>
          <Field label="Minimum level" htmlFor="minStockLevel" error={errors.minStockLevel}>
            <Input id="minStockLevel" type="number" step="0.01" min="0" value={form.minStockLevel} onChange={update('minStockLevel')} invalid={Boolean(errors.minStockLevel)} />
          </Field>
          <Field label="Reorder level" htmlFor="reorderLevel" error={errors.reorderLevel} hint="Triggers the low-stock alert">
            <Input id="reorderLevel" type="number" step="0.01" min="0" value={form.reorderLevel} onChange={update('reorderLevel')} invalid={Boolean(errors.reorderLevel)} />
          </Field>
          <Field label="Maximum level" htmlFor="maxStockLevel" error={errors.maxStockLevel}>
            <Input id="maxStockLevel" type="number" step="0.01" min="0" value={form.maxStockLevel} onChange={update('maxStockLevel')} invalid={Boolean(errors.maxStockLevel)} placeholder="No limit" />
          </Field>
        </div>
      </Card>

      <Card padded={false}>
        <CardHeader title="Batch, serial & expiry" description="Optional traceability and shelf-life tracking" />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Batch number" htmlFor="batchNumber">
            <Input id="batchNumber" value={form.batchNumber} onChange={update('batchNumber')} placeholder="LOT-2026-01" />
          </Field>
          <Field label="Serial number" htmlFor="serialNumber">
            <Input id="serialNumber" value={form.serialNumber} onChange={update('serialNumber')} placeholder="SN-000123" />
          </Field>
          <Field label="Manufacturing date" htmlFor="manufacturingDate">
            <Input id="manufacturingDate" type="date" value={form.manufacturingDate} onChange={update('manufacturingDate')} />
          </Field>
          <Field label="Expiry date" htmlFor="expiryDate" error={errors.expiryDate}>
            <Input id="expiryDate" type="date" value={form.expiryDate} onChange={update('expiryDate')} invalid={Boolean(errors.expiryDate)} />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => navigate('/products')}>
          Cancel
        </Button>
        <Button type="submit" icon={<Save className="h-4 w-4" />} loading={mutation.isPending}>
          {isEdit ? 'Save changes' : 'Create product'}
        </Button>
      </div>
    </form>
  );
}