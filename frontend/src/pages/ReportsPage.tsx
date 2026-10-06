import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api, normalizeList, tokenStore } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/ToastProvider';
import { formatCurrency, formatDate, formatNumber, humanize } from '@/lib/format';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  LoadingBlock,
  PageHeader,
  Select,
} from '@/components/ui';
import { StatCard } from '@/components/feedback';
import { DataTable, Pagination, type Column } from '@/components/DataTable';
import { TopProductsChart } from '@/components/charts';
import { StatusBadge } from '@/components/StatusBadge';
import type {
  Category,
  ExpiryReportItem,
  FastMovingItem,
  InventoryTransaction,
  ValuationReport,
  Warehouse,
} from '@/types';

type Tab = 'valuation' | 'movements' | 'expiry' | 'fast-moving';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'valuation', label: 'Valuation' },
  { key: 'movements', label: 'Movements' },
  { key: 'expiry', label: 'Expiry' },
  { key: 'fast-moving', label: 'Fast moving' },
];

const MOVEMENT_TYPES = ['RECEIVED', 'ISSUED', 'RETURNED', 'TRANSFERRED', 'ADJUSTED', 'DAMAGED', 'LOST', 'EXPIRED'];

export function ReportsPage() {
  const { can } = useAuth();
  const toast = useToast();

  const [tab, setTab] = useState<Tab>('valuation');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [warehouseId, setWarehouseId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [movementType, setMovementType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expiryDays, setExpiryDays] = useState('90');

  const warehouses = useQuery({
    queryKey: ['warehouses', 'all'],
    queryFn: () => api.get<unknown>('/api/v1/warehouses', { limit: 100 }),
  });
  const categories = useQuery({
    queryKey: ['categories', 'all'],
    queryFn: () => api.get<unknown>('/api/v1/categories', { limit: 100 }),
  });

  const warehouseOptions = normalizeList<Warehouse>(warehouses.data, 100).items;
  const categoryOptions = normalizeList<Category>(categories.data, 100).items;

  const valuation = useQuery({
    queryKey: ['reports', 'valuation', warehouseId, categoryId, page, limit],
    queryFn: () =>
      api.get<ValuationReport>('/api/v1/reports/valuation', {
        page,
        limit,
        warehouseId: warehouseId || undefined,
        categoryId: categoryId || undefined,
      }),
    enabled: tab === 'valuation',
  });

  const movements = useQuery({
    queryKey: ['reports', 'movements', movementType, startDate, endDate, page, limit],
    queryFn: () =>
      api.get<unknown>('/api/v1/reports/movements', {
        page,
        limit,
        type: movementType || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
    enabled: tab === 'movements',
  });

  const expiry = useQuery({
    queryKey: ['reports', 'expiry', expiryDays, warehouseId, categoryId, page, limit],
    queryFn: () =>
      api.get<unknown>('/api/v1/reports/expiry', {
        page,
        limit,
        days: expiryDays,
        warehouseId: warehouseId || undefined,
        categoryId: categoryId || undefined,
      }),
    enabled: tab === 'expiry',
  });

  const fastMoving = useQuery({
    queryKey: ['reports', 'fast-moving', expiryDays, warehouseId],
    queryFn: () =>
      api.get<FastMovingItem[]>('/api/v1/reports/fast-moving', {
        days: expiryDays,
        warehouseId: warehouseId || undefined,
      }),
    enabled: tab === 'fast-moving',
  });

  const movementList = normalizeList<InventoryTransaction>(movements.data, limit);
  const expiryList = normalizeList<ExpiryReportItem>(expiry.data, limit);

  /**
   * The export endpoint streams CSV with an attachment header, so it is fetched
   * with an explicit Authorization header and handed to a blob download rather
   * than going through the JSON envelope helper.
   */
  const exportValuation = async () => {
    try {
      const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
      const query = new URLSearchParams({
        warehouseId,
        categoryId,
      });
      query.forEach((value, key) => {
        if (!value) query.delete(key);
      });

      const response = await fetch(
        `${base}/api/v1/reports/valuation/export?${query.toString()}`,
        { headers: { Authorization: `Bearer ${tokenStore.access ?? ''}` } },
      );

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'inventory-valuation.csv';
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success('Valuation exported');
    } catch (error) {
      toast.error(error, 'Could not export the report');
    }
  };

  const valuationColumns: Array<Column<ValuationReport['items'][number]>> = [
    {
      key: 'product',
      header: 'Product',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{row.productName}</p>
          <p className="truncate font-mono text-xs text-slate-500">{row.sku}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      secondary: true,
      render: (row) => row.category ?? '—',
    },
    {
      key: 'warehouse',
      header: 'Warehouse',
      secondary: true,
      render: (row) => row.warehouse ?? '—',
    },
    {
      key: 'quantity',
      header: 'Quantity',
      render: (row) => (
        <span className="tabular font-medium text-slate-900">{formatNumber(row.quantity)}</span>
      ),
    },
    {
      key: 'cost',
      header: 'Unit cost',
      secondary: true,
      render: (row) => (
        <span className="tabular text-slate-600">{formatCurrency(row.costPrice)}</span>
      ),
    },
    {
      key: 'value',
      header: 'Stock value',
      render: (row) => (
        <span className="tabular font-semibold text-slate-900">
          {formatCurrency(row.stockValue)}
        </span>
      ),
    },
  ];

  const movementColumns: Array<Column<InventoryTransaction>> = [
    {
      key: 'date',
      header: 'When',
      render: (row) => <span className="whitespace-nowrap text-xs">{formatDate(row.createdAt)}</span>,
    },
    {
      key: 'product',
      header: 'Product',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{row.product?.name ?? '—'}</p>
          <p className="truncate font-mono text-xs text-slate-500">{row.product?.sku ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      secondary: true,
      render: (row) => <StatusBadge status={row.type} />,
    },
    {
      key: 'quantity',
      header: 'Quantity',
      render: (row) => (
        <span className="tabular font-semibold text-slate-900">{formatNumber(row.quantity)}</span>
      ),
    },
    {
      key: 'warehouse',
      header: 'Warehouse',
      secondary: true,
      render: (row) => row.warehouse?.name ?? '—',
    },
    {
      key: 'performedBy',
      header: 'By',
      secondary: true,
      render: (row) => row.performedBy?.fullName ?? '—',
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
  ];

  const expiryColumns: Array<Column<ExpiryReportItem>> = [
    {
      key: 'product',
      header: 'Product',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{row.name}</p>
          <p className="truncate font-mono text-xs text-slate-500">
            {row.sku}
            {row.batchNumber ? ` · ${row.batchNumber}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'warehouse',
      header: 'Warehouse',
      secondary: true,
      render: (row) => row.warehouse ?? '—',
    },
    {
      key: 'quantity',
      header: 'On hand',
      render: (row) => (
        <span className="tabular font-medium text-slate-900">{formatNumber(row.currentStock)}</span>
      ),
    },
    {
      key: 'expiry',
      header: 'Expires',
      render: (row) => formatDate(row.expiryDate),
    },
    {
      key: 'days',
      header: 'Days left',
      render: (row) => {
        const days = row.daysUntilExpiry ?? 0;
        return (
          <span
            className={
              days <= 7
                ? 'tabular inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700'
                : days <= 30
                  ? 'tabular inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700'
                  : 'tabular inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600'
            }
          >
            {days}
          </span>
        );
      },
    },
  ];

  const fastMovingItems = fastMoving.data ?? [];

  const fastMovingColumns: Array<Column<FastMovingItem>> = [
    {
      key: 'product',
      header: 'Product',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{row.productName ?? '—'}</p>
          <p className="truncate font-mono text-xs text-slate-500">{row.sku ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'sold',
      header: 'Quantity sold',
      render: (row) => (
        <span className="tabular font-semibold text-slate-900">
          {formatNumber(row.quantitySold)}
        </span>
      ),
    },
    {
      key: 'revenue',
      header: 'Revenue',
      render: (row) => (
        <span className="tabular font-medium text-slate-900">{formatCurrency(row.revenue)}</span>
      ),
    },
    {
      key: 'stock',
      header: 'Remaining',
      secondary: true,
      render: (row) => (
        <span className="tabular text-slate-600">{formatNumber(row.currentStock)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description="Valuation, movements, expiry and velocity"
        actions={
          can('export_reports') && tab === 'valuation' ? (
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => void exportValuation()}>
              Export CSV
            </Button>
          ) : null
        }
      />

      <div className="flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => {
              setTab(item.key);
              setPage(1);
            }}
            className={
              tab === item.key
                ? 'flex-1 whitespace-nowrap rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white'
                : 'flex-1 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50'
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* --------------------------------------------------------- Filters */}
      <Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tab === 'valuation' || tab === 'expiry' ? (
            <Field label="Warehouse">
              <Select
                value={warehouseId}
                onChange={(event) => {
                  setWarehouseId(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All warehouses</option>
                {warehouseOptions.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {tab === 'valuation' || tab === 'expiry' ? (
            <Field label="Category">
              <Select
                value={categoryId}
                onChange={(event) => {
                  setCategoryId(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All categories</option>
                {categoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {tab === 'movements' ? (
            <>
              <Field label="Movement type">
                <Select
                  value={movementType}
                  onChange={(event) => {
                    setMovementType(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All types</option>
                  {MOVEMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {humanize(type)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="From">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(event) => {
                    setStartDate(event.target.value);
                    setPage(1);
                  }}
                />
              </Field>
              <Field label="To">
                <Input
                  type="date"
                  value={endDate}
                  onChange={(event) => {
                    setEndDate(event.target.value);
                    setPage(1);
                  }}
                />
              </Field>
            </>
          ) : null}

          {tab === 'expiry' || tab === 'fast-moving' ? (
            <Field label="Window (days)" htmlFor="report-days">
              <Input
                id="report-days"
                type="number"
                min="1"
                value={expiryDays}
                onChange={(event) => {
                  setExpiryDays(event.target.value);
                  setPage(1);
                }}
              />
            </Field>
          ) : null}

          {tab === 'fast-moving' ? (
            <Field label="Warehouse">
              <Select
                value={warehouseId}
                onChange={(event) => setWarehouseId(event.target.value)}
              >
                <option value="">All warehouses</option>
                {warehouseOptions.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>
      </Card>

      {/* ------------------------------------------------------ Valuation */}
      {tab === 'valuation' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label="Total stock value"
              value={formatCurrency(valuation.data?.summary.totalValue ?? 0)}
              hint="Across the filtered selection"
              tone="brand"
            />
            <StatCard
              label="Total units"
              value={formatNumber(valuation.data?.summary.totalQuantity ?? 0)}
              hint={`${valuation.data?.total ?? 0} stock records`}
            />
          </div>

          <Card padded={false}>
            <CardHeader title="Inventory valuation" />
            <DataTable
              columns={valuationColumns}
              rows={valuation.data?.items ?? []}
              rowKey={(row) => `${row.productId}-${row.warehouse ?? ''}`}
              isLoading={valuation.isLoading}
              error={valuation.error}
              emptyTitle="No valuation data"
              emptyDescription="Stock value appears once products are stocked."
            />
            {(valuation.data?.total ?? 0) > 0 ? (
              <Pagination
                page={page}
                limit={limit}
                total={valuation.data?.total ?? 0}
                onPageChange={setPage}
                onLimitChange={(value) => {
                  setLimit(value);
                  setPage(1);
                }}
              />
            ) : null}
          </Card>
        </>
      ) : null}

      {/* ------------------------------------------------------ Movements */}
      {tab === 'movements' ? (
        <Card padded={false}>
          <CardHeader title="Stock movements" description="All recorded ledger entries in the selected window" />
          <DataTable
            columns={movementColumns}
            rows={movementList.items}
            rowKey={(row) => row.id}
            isLoading={movements.isLoading}
            error={movements.error}
            emptyTitle="No movements in this range"
            emptyDescription="Widen the date range to see more activity."
          />
          {movementList.total > 0 ? (
            <Pagination
              page={page}
              limit={limit}
              total={movementList.total}
              onPageChange={setPage}
              onLimitChange={(value) => {
                setLimit(value);
                setPage(1);
              }}
            />
          ) : null}
        </Card>
      ) : null}

      {/* --------------------------------------------------------- Expiry */}
      {tab === 'expiry' ? (
        <Card padded={false}>
          <CardHeader
            title="Expiry watchlist"
            description={`Products expiring within ${expiryDays || 90} days`}
          />
          <DataTable
            columns={expiryColumns}
            rows={expiryList.items}
            rowKey={(row) => `${row.productId}-${row.expiryDate ?? ''}`}
            isLoading={expiry.isLoading}
            error={expiry.error}
            emptyTitle="Nothing expiring soon"
            emptyDescription="No products fall inside this window."
          />
          {expiryList.total > 0 ? (
            <Pagination
              page={page}
              limit={limit}
              total={expiryList.total}
              onPageChange={setPage}
              onLimitChange={(value) => {
                setLimit(value);
                setPage(1);
              }}
            />
          ) : null}
        </Card>
      ) : null}

      {/* ---------------------------------------------------- Fast moving */}
      {tab === 'fast-moving' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card padded={false}>
            <CardHeader
              title="Fastest movers"
              description={`Top 10 by quantity issued over ${expiryDays || 90} days`}
            />
            {fastMoving.isLoading ? (
              <LoadingBlock />
            ) : (
              <TopProductsChart
                data={fastMovingItems.map((item) => ({
                  label: item.productName ?? item.sku ?? 'Unknown',
                  value: item.quantitySold,
                }))}
              />
            )}
          </Card>

          <Card padded={false}>
            <CardHeader title="Movement detail" />
            <DataTable
              columns={fastMovingColumns}
              rows={fastMovingItems}
              rowKey={(row) => row.productId}
              isLoading={fastMoving.isLoading}
              error={fastMoving.error}
              emptyTitle="No completed issues"
              emptyDescription="Once stock is issued, velocity appears here."
            />
          </Card>
        </div>
      ) : null}

      {!can('export_reports') ? (
        <Alert tone="info">
          You can view reports but not export them. Ask an administrator for the “Export Reports”
          permission to download CSV files.
        </Alert>
      ) : null}
    </div>
  );
}