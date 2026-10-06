import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  PackageCheck,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { api, normalizeList } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/ToastProvider';
import { formatCurrency, formatDate, formatNumber, humanize } from '@/lib/format';
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from '@/components/ui';
import { DataTable, Pagination, type Column } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import type { PurchaseOrder, Product, Supplier, Warehouse } from '@/types';

const STATUS_OPTIONS = [
  'DRAFT', 'PENDING', 'APPROVED', 'REJECTED',
  'RECEIVED', 'PARTIALLY_RECEIVED', 'CANCELLED',
];

interface DraftLine {
  productId: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxPercent: string;
}

const EMPTY_LINE: DraftLine = {
  productId: '',
  quantity: '1',
  unitPrice: '0',
  discountPercent: '0',
  taxPercent: '0',
};

const lineTotal = (line: DraftLine): number => {
  const quantity = Number(line.quantity) || 0;
  const price = Number(line.unitPrice) || 0;
  const discount = (Number(line.discountPercent) || 0) / 100;
  const tax = (Number(line.taxPercent) || 0) / 100;
  const net = quantity * price * (1 - discount);
  return net * (1 + tax);
};

export function PurchaseOrdersPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [status, setStatus] = useState('');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    supplierId: '',
    warehouseId: '',
    expectedDate: '',
    notes: '',
    terms: '',
  });
  const [lines, setLines] = useState<DraftLine[]>([{ ...EMPTY_LINE }]);
  const [createError, setCreateError] = useState('');

  const [detailId, setDetailId] = useState<string | null>(null);
  const [reasonTarget, setReasonTarget] = useState<{
    order: PurchaseOrder;
    action: 'reject' | 'cancel';
  } | null>(null);
  const [reason, setReason] = useState('');

  const [receiveTarget, setReceiveTarget] = useState<PurchaseOrder | null>(null);
  const [receiveLines, setReceiveLines] = useState<
    Record<string, { quantity: string; batchNumber: string; expiryDate: string }>
  >({});

  const orders = useQuery({
    queryKey: ['purchase-orders', 'list', status, page, limit],
    queryFn: () =>
      api.get<unknown>('/api/v1/purchase-orders', {
        page,
        limit,
        status: status || undefined,
      }),
  });

  const suppliers = useQuery({
    queryKey: ['suppliers', 'all'],
    queryFn: () => api.get<unknown>('/api/v1/suppliers', { limit: 100, status: 'ACTIVE' }),
    enabled: isCreateOpen,
  });

  const warehouses = useQuery({
    queryKey: ['warehouses', 'all'],
    queryFn: () => api.get<unknown>('/api/v1/warehouses', { limit: 100 }),
  });

  const products = useQuery({
    queryKey: ['products', 'options'],
    queryFn: () => api.get<unknown>('/api/v1/products', { limit: 100, status: 'ACTIVE' }),
    enabled: isCreateOpen,
  });

  const detail = useQuery({
    queryKey: ['purchase-orders', 'detail', detailId],
    queryFn: () => api.get<PurchaseOrder>(`/api/v1/purchase-orders/${detailId}`),
    enabled: detailId !== null,
  });

  const list = normalizeList<PurchaseOrder>(orders.data, limit);
  const supplierOptions = normalizeList<Supplier>(suppliers.data, 100).items;
  const warehouseOptions = normalizeList<Warehouse>(warehouses.data, 100).items;
  const productOptions = normalizeList<Product>(products.data, 100).items;

  const canManage = can('manage_purchase_orders');
  const canApprove = can('approve_transactions');
  const canReceive = can('receive_stock');

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const runAction = useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: string; body?: unknown }) =>
      api.post(`/api/v1/purchase-orders/${id}/${action}`, body),
    onSuccess: (_data, variables) => {
      toast.success(`Purchase order ${variables.action}ed`);
      setReasonTarget(null);
      setReason('');
      invalidate();
    },
    onError: (error) => toast.error(error, 'Could not complete that action'),
  });

  const createOrder = useMutation({
    mutationFn: () =>
      api.post('/api/v1/purchase-orders', {
        supplierId: createForm.supplierId,
        warehouseId: createForm.warehouseId,
        expectedDate: createForm.expectedDate || undefined,
        notes: createForm.notes || undefined,
        terms: createForm.terms || undefined,
        items: lines
          .filter((line) => line.productId)
          .map((line) => ({
            productId: line.productId,
            quantity: Number(line.quantity),
            unitPrice: Number(line.unitPrice),
            discountPercent: Number(line.discountPercent) || 0,
            taxPercent: Number(line.taxPercent) || 0,
          })),
      }),
    onSuccess: () => {
      toast.success('Purchase order created as a draft');
      setIsCreateOpen(false);
      setCreateForm({ supplierId: '', warehouseId: '', expectedDate: '', notes: '', terms: '' });
      setLines([{ ...EMPTY_LINE }]);
      invalidate();
    },
    onError: (error) => setCreateError(error.message || 'Could not create the purchase order'),
  });

  const removeItem = useMutation({
    mutationFn: ({ orderId, itemId }: { orderId: string; itemId: string }) =>
      api.delete(`/api/v1/purchase-orders/items/${orderId}/${itemId}`),
    onSuccess: () => {
      toast.success('Line removed');
      invalidate();
    },
    onError: (error) => toast.error(error, 'Could not remove the line'),
  });

  const receiveStock = useMutation({
    mutationFn: () => {
      const items = Object.entries(receiveLines)
        .map(([itemId, value]) => ({
          purchaseOrderItemId: itemId,
          receivedQuantity: Number(value.quantity) || 0,
          batchNumber: value.batchNumber || null,
          expiryDate: value.expiryDate || null,
        }))
        .filter((item) => item.receivedQuantity > 0);

      return api.post(`/api/v1/purchase-orders/${receiveTarget!.id}/receive`, { items });
    },
    onSuccess: () => {
      toast.success('Stock received');
      setReceiveTarget(null);
      setReceiveLines({});
      invalidate();
    },
    onError: (error) => toast.error(error, 'Could not receive this stock'),
  });

  const orderTotal = useMemo(
    () => lines.reduce((sum, line) => sum + (line.productId ? lineTotal(line) : 0), 0),
    [lines],
  );

  const submitCreate = () => {
    const validLines = lines.filter((line) => line.productId);
    if (!createForm.supplierId) {
      setCreateError('Choose a supplier.');
      return;
    }
    if (!createForm.warehouseId) {
      setCreateError('Choose a warehouse.');
      return;
    }
    if (validLines.length === 0) {
      setCreateError('Add at least one product line.');
      return;
    }
    const invalid = validLines.some(
      (line) => Number(line.quantity) <= 0 || Number(line.unitPrice) < 0,
    );
    if (invalid) {
      setCreateError('Every line needs a quantity above zero and a valid unit price.');
      return;
    }
    setCreateError('');
    createOrder.mutate();
  };

  const updateLine = (index: number, patch: Partial<DraftLine>) => {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const columns: Array<Column<PurchaseOrder>> = [
    {
      key: 'number',
      header: 'Order',
      render: (order) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-medium text-slate-900">{order.orderNumber}</p>
          <p className="truncate text-xs text-slate-500">
            {order.supplier?.name ?? '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'warehouse',
      header: 'Warehouse',
      secondary: true,
      render: (order) => order.warehouse?.name ?? '—',
    },
    {
      key: 'expected',
      header: 'Expected',
      secondary: true,
      render: (order) => formatDate(order.expectedDate),
    },
    {
      key: 'total',
      header: 'Total',
      render: (order) => (
        <span className="tabular font-semibold text-slate-900">
          {formatCurrency(order.totalAmount)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (order) => <StatusBadge status={order.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'text-right',
      render: (order) => (
        <div className="flex flex-wrap items-center justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setDetailId(order.id)}>
            View
          </Button>

          {canApprove && order.status === 'DRAFT' ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => runAction.mutate({ id: order.id, action: 'submit' })}
              disabled={runAction.isPending}
            >
              <Send className="h-3.5 w-3.5" />
              Submit
            </Button>
          ) : null}

          {canApprove && order.status === 'PENDING' ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="text-emerald-600 hover:bg-emerald-50"
                onClick={() => runAction.mutate({ id: order.id, action: 'approve' })}
                disabled={runAction.isPending}
              >
                <Check className="h-3.5 w-3.5" />
                Approve
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:bg-red-50"
                onClick={() => setReasonTarget({ order, action: 'reject' })}
              >
                <X className="h-3.5 w-3.5" />
                Reject
              </Button>
            </>
          ) : null}

          {canReceive && (order.status === 'APPROVED' || order.status === 'PARTIALLY_RECEIVED') ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-brand-600 hover:bg-brand-50"
              onClick={() => {
                setReceiveTarget(order);
                setReceiveLines({});
              }}
            >
              <PackageCheck className="h-3.5 w-3.5" />
              Receive
            </Button>
          ) : null}

          {canManage && !['COMPLETED', 'CANCELLED', 'RECEIVED'].includes(order.status) ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:bg-red-50"
              onClick={() => setReasonTarget({ order, action: 'cancel' })}
            >
              Cancel
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const detailItems = detail.data?.items ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Purchase orders"
        description={`${list.total} order${list.total === 1 ? '' : 's'} on record`}
        actions={
          canManage ? (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setIsCreateOpen(true)}>
              New purchase order
            </Button>
          ) : null
        }
      />

      <Card padded={false}>
        <div className="border-b border-slate-200 p-4">
          <Field label="Status" className="max-w-xs">
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
          rowKey={(order) => order.id}
          isLoading={orders.isLoading}
          error={orders.error}
          emptyTitle="No purchase orders"
          emptyDescription="Create an order to request stock from a supplier."
          emptyAction={
            canManage ? (
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setIsCreateOpen(true)}>
                New purchase order
              </Button>
            ) : null
          }
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

      {/* ------------------------------------------------------- Create */}
      <Modal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="New purchase order"
        description="Orders start as a draft. Submit them for approval when ready."
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitCreate} loading={createOrder.isPending}>
              Create draft
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Supplier" htmlFor="po-supplier" required>
              <Select
                id="po-supplier"
                value={createForm.supplierId}
                onChange={(event) => setCreateForm({ ...createForm, supplierId: event.target.value })}
              >
                <option value="">Select a supplier</option>
                {supplierOptions.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Warehouse" htmlFor="po-warehouse" required>
              <Select
                id="po-warehouse"
                value={createForm.warehouseId}
                onChange={(event) => setCreateForm({ ...createForm, warehouseId: event.target.value })}
              >
                <option value="">Select a warehouse</option>
                {warehouseOptions.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Expected date" htmlFor="po-expected">
              <Input
                id="po-expected"
                type="date"
                value={createForm.expectedDate}
                onChange={(event) => setCreateForm({ ...createForm, expectedDate: event.target.value })}
              />
            </Field>
            <Field label="Terms" htmlFor="po-terms" hint="e.g. Net 30">
              <Input
                id="po-terms"
                value={createForm.terms}
                onChange={(event) => setCreateForm({ ...createForm, terms: event.target.value })}
                placeholder="Optional"
              />
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">Order lines</p>
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => setLines((current) => [...current, { ...EMPTY_LINE }])}
              >
                Add line
              </Button>
            </div>

            <div className="space-y-2">
              {lines.map((line, index) => (
                <div
                  key={index}
                  className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-12"
                >
                  <Field label="Product" className="sm:col-span-4" htmlFor={`po-line-product-${index}`}>
                    <Select
                      id={`po-line-product-${index}`}
                      value={line.productId}
                      onChange={(event) => {
                        const product = productOptions.find((p) => p.id === event.target.value);
                        updateLine(index, {
                          productId: event.target.value,
                          // Default the price to the product's cost so the
                          // common case is one click, not five keystrokes.
                          unitPrice: product ? String(product.costPrice) : line.unitPrice,
                        });
                      }}
                    >
                      <option value="">Select a product</option>
                      {productOptions.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} ({product.sku})
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Qty" className="sm:col-span-2" htmlFor={`po-line-qty-${index}`}>
                    <Input
                      id={`po-line-qty-${index}`}
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.quantity}
                      onChange={(event) => updateLine(index, { quantity: event.target.value })}
                    />
                  </Field>
                  <Field label="Unit price" className="sm:col-span-2" htmlFor={`po-line-price-${index}`}>
                    <Input
                      id={`po-line-price-${index}`}
                      type="number"
                      step="0.01"
                      min="0"
                      prefix="$"
                      value={line.unitPrice}
                      onChange={(event) => updateLine(index, { unitPrice: event.target.value })}
                    />
                  </Field>
                  <Field label="Disc %" className="sm:col-span-1" htmlFor={`po-line-disc-${index}`}>
                    <Input
                      id={`po-line-disc-${index}`}
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={line.discountPercent}
                      onChange={(event) => updateLine(index, { discountPercent: event.target.value })}
                    />
                  </Field>
                  <Field label="Tax %" className="sm:col-span-1" htmlFor={`po-line-tax-${index}`}>
                    <Input
                      id={`po-line-tax-${index}`}
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={line.taxPercent}
                      onChange={(event) => updateLine(index, { taxPercent: event.target.value })}
                    />
                  </Field>
                  <div className="flex items-end sm:col-span-2">
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="tabular text-sm font-semibold text-slate-900">
                        {formatCurrency(lineTotal(line))}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:bg-red-50"
                        disabled={lines.length === 1}
                        onClick={() =>
                          setLines((current) => current.filter((_, i) => i !== index))
                        }
                        aria-label={`Remove line ${index + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex justify-end border-t border-slate-200 pt-3">
              <p className="text-sm text-slate-600">
                Order total:{' '}
                <span className="tabular text-base font-semibold text-slate-900">
                  {formatCurrency(orderTotal)}
                </span>
              </p>
            </div>
          </div>

          <Field label="Notes" htmlFor="po-notes">
            <Textarea
              id="po-notes"
              rows={2}
              value={createForm.notes}
              onChange={(event) => setCreateForm({ ...createForm, notes: event.target.value })}
              placeholder="Delivery instructions, PO references…"
            />
          </Field>

          {createError ? <Alert tone="danger">{createError}</Alert> : null}
        </div>
      </Modal>

      {/* ------------------------------------------------------- Detail */}
      <Modal
        open={detailId !== null}
        onClose={() => setDetailId(null)}
        title={detail.data?.orderNumber ?? 'Purchase order'}
        description={
          detail.data
            ? `${detail.data.supplier?.name ?? 'Supplier'} · ${detail.data.warehouse?.name ?? ''}`
            : undefined
        }
        size="xl"
        footer={
          <Button variant="secondary" onClick={() => setDetailId(null)}>
            Close
          </Button>
        }
      >
        {!detail.data ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={detail.data.status} />
              <span className="tabular text-sm font-semibold text-slate-900">
                {formatCurrency(detail.data.totalAmount)}
              </span>
              {detail.data.expectedDate ? (
                <span className="text-xs text-slate-500">
                  Expected {formatDate(detail.data.expectedDate)}
                </span>
              ) : null}
            </div>

            {detail.data.rejectionReason ? (
              <Alert tone="danger">Rejected: {detail.data.rejectionReason}</Alert>
            ) : null}
            {detail.data.notes ? (
              <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{detail.data.notes}</p>
            ) : null}

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="th">Product</th>
                    <th className="th text-right">Ordered</th>
                    <th className="th text-right">Received</th>
                    <th className="th text-right">Unit price</th>
                    <th className="th text-right">Total</th>
                    {canManage && detail.data.status === 'DRAFT' ? <th className="th" /> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detailItems.map((item) => (
                    <tr key={item.id}>
                      <td className="td">
                        <p className="font-medium text-slate-900">{item.product?.name}</p>
                        <p className="font-mono text-xs text-slate-500">{item.product?.sku}</p>
                      </td>
                      <td className="td tabular text-right">{formatNumber(item.quantity)}</td>
                      <td className="td tabular text-right">{formatNumber(item.receivedQuantity)}</td>
                      <td className="td tabular text-right">{formatCurrency(item.unitPrice)}</td>
                      <td className="td tabular text-right font-medium">
                        {formatCurrency(item.totalPrice)}
                      </td>
                      {canManage && detail.data?.status === 'DRAFT' ? (
                        <td className="td text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() =>
                              removeItem.mutate({ orderId: detail.data!.id, itemId: item.id })
                            }
                            aria-label={`Remove ${item.product?.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end border-t border-slate-200 pt-3 text-sm">
              <dl className="w-56 space-y-1">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Subtotal</dt>
                  <dd className="tabular">{formatCurrency(detail.data.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Discount</dt>
                  <dd className="tabular">−{formatCurrency(detail.data.discountAmount)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Tax</dt>
                  <dd className="tabular">{formatCurrency(detail.data.taxAmount)}</dd>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular">{formatCurrency(detail.data.totalAmount)}</dd>
                </div>
              </dl>
            </div>
          </div>
        )}
      </Modal>

      {/* ------------------------------------------------ Reject / cancel */}
      <Modal
        open={reasonTarget !== null}
        onClose={() => {
          setReasonTarget(null);
          setReason('');
        }}
        title={reasonTarget?.action === 'reject' ? 'Reject purchase order' : 'Cancel purchase order'}
        description={
          reasonTarget?.action === 'reject'
            ? `Reject ${reasonTarget?.order.orderNumber}? The supplier will be asked for a revision.`
            : `Cancel ${reasonTarget?.order.orderNumber}? This cannot be undone.`
        }
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setReasonTarget(null);
                setReason('');
              }}
              disabled={runAction.isPending}
            >
              Back
            </Button>
            <Button
              variant="danger"
              loading={runAction.isPending}
              onClick={() =>
                reasonTarget &&
                runAction.mutate(
                  reasonTarget.action === 'reject'
                    ? { id: reasonTarget.order.id, action: 'reject', body: { rejectionReason: reason || undefined } }
                    : { id: reasonTarget.order.id, action: 'cancel', body: { reason: reason || undefined } },
                )
              }
            >
              {reasonTarget?.action === 'reject' ? 'Reject order' : 'Cancel order'}
            </Button>
          </>
        }
      >
        <Field
          label="Reason"
          htmlFor="po-reason"
          hint={reasonTarget?.action === 'reject' ? 'Optional' : 'Recommended for the audit trail'}
        >
          <Textarea
            id="po-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            autoFocus
          />
        </Field>
        {runAction.error ? (
          <div className="mt-3">
            <Alert tone="danger">{runAction.error.message}</Alert>
          </div>
        ) : null}
      </Modal>

      {/* ------------------------------------------------------- Receive */}
      <Modal
        open={receiveTarget !== null}
        onClose={() => {
          setReceiveTarget(null);
          setReceiveLines({});
        }}
        title={`Receive ${receiveTarget?.orderNumber ?? 'stock'}`}
        description="Enter what physically arrived. Leave blank to skip a line."
        size="lg"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setReceiveTarget(null);
                setReceiveLines({});
              }}
              disabled={receiveStock.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (receiveTarget) receiveStock.mutate();
              }}
              loading={receiveStock.isPending}
              disabled={
                !Object.values(receiveLines).some((value) => Number(value.quantity) > 0)
              }
            >
              Confirm receipt
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {(receiveTarget?.items ?? []).map((item) => {
            const outstanding = item.quantity - item.receivedQuantity;
            if (outstanding <= 0) return null;
            const value = receiveLines[item.id] ?? {
              quantity: '',
              batchNumber: '',
              expiryDate: '',
            };
            return (
              <div
                key={item.id}
                className="rounded-lg border border-slate-200 p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">{item.product?.name}</p>
                  <p className="tabular shrink-0 text-xs text-slate-500">
                    {formatNumber(item.receivedQuantity)} of {formatNumber(item.quantity)} received
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Field label="Receiving now" htmlFor={`recv-qty-${item.id}`}>
                    <Input
                      id={`recv-qty-${item.id}`}
                      type="number"
                      step="0.01"
                      min="0"
                      max={outstanding}
                      value={value.quantity}
                      onChange={(event) =>
                        setReceiveLines((current) => ({
                          ...current,
                          [item.id]: { ...value, quantity: event.target.value },
                        }))
                      }
                      placeholder="0"
                    />
                  </Field>
                  <Field label="Batch" htmlFor={`recv-batch-${item.id}`}>
                    <Input
                      id={`recv-batch-${item.id}`}
                      value={value.batchNumber}
                      onChange={(event) =>
                        setReceiveLines((current) => ({
                          ...current,
                          [item.id]: { ...value, batchNumber: event.target.value },
                        }))
                      }
                      placeholder="Optional"
                    />
                  </Field>
                  <Field label="Expiry" htmlFor={`recv-exp-${item.id}`}>
                    <Input
                      id={`recv-exp-${item.id}`}
                      type="date"
                      value={value.expiryDate}
                      onChange={(event) =>
                        setReceiveLines((current) => ({
                          ...current,
                          [item.id]: { ...value, expiryDate: event.target.value },
                        }))
                      }
                    />
                  </Field>
                </div>
              </div>
            );
          })}
          {receiveStock.error ? <Alert tone="danger">{receiveStock.error.message}</Alert> : null}
        </div>
      </Modal>
    </div>
  );
}