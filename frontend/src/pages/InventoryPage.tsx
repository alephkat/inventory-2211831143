import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Boxes, Search } from 'lucide-react';
import { api, normalizeList } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatNumber, formatRelative } from '@/lib/format';
import { Badge, Button, Card, Field, Input, PageHeader, Select } from '@/components/ui';
import { DataTable, Pagination, type Column } from '@/components/DataTable';
import type { InventoryLevel, LowStockItem, Warehouse } from '@/types';

type View = 'levels' | 'low-stock';

export function InventoryPage() {
  const { can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchTimer = useRef<number>();

  const initialView: View = searchParams.get('view') === 'low-stock' ? 'low-stock' : 'levels';
  const [view, setView] = useState<View>(initialView);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const warehouses = useQuery({
    queryKey: ['warehouses', 'all'],
    queryFn: () => api.get<unknown>('/api/v1/warehouses', { limit: 100 }),
  });

  const levels = useQuery({
    queryKey: ['inventory', 'levels', debouncedSearch, warehouseId, page, limit],
    queryFn: () =>
      api.get<unknown>('/api/v1/inventory/levels', {
        page,
        limit,
        search: debouncedSearch || undefined,
        warehouseId: warehouseId || undefined,
      }),
    enabled: view === 'levels',
  });

  const lowStock = useQuery({
    queryKey: ['inventory', 'low-stock'],
    queryFn: () => api.get<LowStockItem[]>('/api/v1/inventory/levels/low-stock'),
    enabled: view === 'low-stock',
  });

  const levelList = normalizeList<InventoryLevel>(levels.data, limit);
  const warehouseOptions = normalizeList<Warehouse>(warehouses.data, 100).items;
  const lowStockItems = lowStock.data ?? [];

  const scheduleSearch = (value: string) => {
    setSearch(value);
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  };

  const switchView = (next: View) => {
    setView(next);
    setPage(1);
    // Keep the deep link from the dashboard in sync so a refresh keeps the tab.
    const params = new URLSearchParams(searchParams);
    if (next === 'low-stock') params.set('view', 'low-stock');
    else params.delete('view');
    setSearchParams(params, { replace: true });
  };

  const totalValue = levelList.items.reduce((sum, row) => sum + (row.stockValue ?? 0), 0);

  const levelColumns: Array<Column<InventoryLevel>> = [
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
      key: 'warehouse',
      header: 'Warehouse',
      secondary: true,
      render: (row) => row.warehouse?.name ?? '—',
    },
    {
      key: 'onHand',
      header: 'On hand',
      render: (row) => (
        <div>
          <p className="tabular font-medium text-slate-900">{formatNumber(row.currentQuantity)}</p>
          <p className="text-[11px] text-slate-500">
            {formatNumber(row.availableQuantity)} available
          </p>
        </div>
      ),
    },
    {
      key: 'reserved',
      header: 'Reserved',
      secondary: true,
      render: (row) => (
        <div>
          <p className="tabular text-slate-700">{formatNumber(row.reservedQuantity)}</p>
          {row.damagedQuantity > 0 ? (
            <p className="text-[11px] text-red-600">{formatNumber(row.damagedQuantity)} damaged</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'reorder',
      header: 'Reorder level',
      secondary: true,
      render: (row) => (
        <span className="tabular text-slate-600">
          {formatNumber(row.reorderQuantity ?? row.product?.reorderLevel ?? 0)}
        </span>
      ),
    },
    {
      key: 'value',
      header: 'Stock value',
      render: (row) => (
        <span className="tabular font-medium text-slate-900">{formatCurrency(row.stockValue)}</span>
      ),
    },
    {
      key: 'updated',
      header: 'Last updated',
      secondary: true,
      render: (row) => (
        <span className="text-xs text-slate-500">{formatRelative(row.lastUpdated)}</span>
      ),
    },
  ];

  const lowStockColumns: Array<Column<LowStockItem>> = [
    {
      key: 'product',
      header: 'Product',
      render: (item) => (
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{item.productName}</p>
            <p className="truncate font-mono text-xs text-slate-500">{item.sku}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'warehouse',
      header: 'Warehouse',
      secondary: true,
      render: (item) => item.warehouseName,
    },
    {
      key: 'current',
      header: 'In stock',
      render: (item) => (
        <span className="tabular font-medium text-slate-900">{formatNumber(item.currentStock)}</span>
      ),
    },
    {
      key: 'reorder',
      header: 'Reorder at',
      secondary: true,
      render: (item) => (
        <span className="tabular text-slate-600">{formatNumber(item.reorderLevel)}</span>
      ),
    },
    {
      key: 'deficit',
      header: 'Deficit',
      render: (item) => (
        <Badge tone={item.deficit > 0 ? 'warning' : 'neutral'}>
          {item.deficit > 0 ? `short ${formatNumber(item.deficit)}` : 'at level'}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stock levels"
        description="Live quantities on hand across every warehouse"
        actions={
          can('receive_stock') || can('issue_stock') ? (
            <span className="text-xs text-slate-500">
              Record movements from the{' '}
              <span className="font-medium text-slate-700">Transactions</span> tab.
            </span>
          ) : null
        }
      />

      <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
        {(
          [
            { key: 'levels' as const, label: 'All stock', count: levelList.total },
            { key: 'low-stock' as const, label: 'Low stock', count: lowStockItems.length },
          ]
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => switchView(tab.key)}
            className={
              view === tab.key
                ? 'flex-1 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white'
                : 'flex-1 rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50'
            }
          >
            {tab.label}
            {tab.key === 'low-stock' && lowStockItems.length > 0 ? (
              <span
                className={
                  view === tab.key
                    ? 'ml-2 rounded-full bg-white/20 px-1.5 py-0.5 text-xs'
                    : 'ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700'
                }
              >
                {lowStockItems.length}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <Card padded={false}>
        {view === 'levels' ? (
          <>
            <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-3">
              <Field label="Search" className="sm:col-span-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    className="pl-9"
                    placeholder="Product, SKU or warehouse…"
                    value={search}
                    onChange={(event) => {
                      scheduleSearch(event.target.value);
                      setPage(1);
                    }}
                  />
                </div>
              </Field>
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
            </div>

            {levelList.items.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-600">
                  Page total:{' '}
                  <span className="tabular font-semibold text-slate-900">
                    {formatCurrency(totalValue)}
                  </span>
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => switchView('low-stock')}
                >
                  Show only low stock
                </Button>
              </div>
            ) : null}

            <DataTable
              columns={levelColumns}
              rows={levelList.items}
              rowKey={(row) => row.id}
              isLoading={levels.isLoading}
              error={levels.error}
              emptyTitle="No stock records found"
              emptyDescription={
                debouncedSearch || warehouseId
                  ? 'Try clearing the filters.'
                  : 'Stock appears here once products are received into a warehouse.'
              }
              emptyAction={
                !debouncedSearch && !warehouseId ? (
                  <Button icon={<Boxes className="h-4 w-4" />} onClick={() => switchView('low-stock')}>
                    View low stock
                  </Button>
                ) : null
              }
            />

            {levelList.total > 0 ? (
              <Pagination
                page={page}
                limit={limit}
                total={levelList.total}
                onPageChange={setPage}
                onLimitChange={(value) => {
                  setLimit(value);
                  setPage(1);
                }}
              />
            ) : null}
          </>
        ) : (
          <>
            <div className="border-b border-slate-200 bg-amber-50/50 px-4 py-3">
              <p className="text-xs text-amber-800">
                Items at or below their reorder level. Raise a purchase order or adjust stock to
                bring them back up.
              </p>
            </div>
            <DataTable
              columns={lowStockColumns}
              rows={lowStockItems}
              rowKey={(item) => `${item.productId}-${item.warehouseId}`}
              isLoading={lowStock.isLoading}
              error={lowStock.error}
              emptyTitle="Nothing is low on stock"
              emptyDescription="Every product is above its reorder level."
            />
          </>
        )}
      </Card>
    </div>
  );
}