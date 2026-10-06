import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  CalendarClock,
  ClipboardCheck,
  DollarSign,
  Package,
  TrendingUp,
} from 'lucide-react';
import { api, normalizeList } from '@/lib/api';
import { formatCurrency, formatDate, formatNumber, formatRelative } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { Card, CardHeader, LoadingBlock, Alert } from '@/components/ui';
import { StatCard } from '@/components/feedback';
import { StatusBadge } from '@/components/StatusBadge';
import { InventoryValueChart, StockMovementChart } from '@/components/charts';
import type { DashboardStats, InventoryValueChart as InventoryValueData, StockMovementChart as MovementData } from '@/types';

export function DashboardPage() {
  const { user } = useAuth();

  const stats = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => api.get<DashboardStats>('/api/v1/dashboard/stats'),
    // The dashboard aggregates a dozen counts on the server; caching briefly
    // avoids re-running it on every remount.
    staleTime: 60_000,
  });

  const movement = useQuery({
    queryKey: ['dashboard', 'stock-movement', 14],
    queryFn: () => api.get<MovementData>('/api/v1/dashboard/charts/stock-movement', { days: 14 }),
    staleTime: 60_000,
  });

  const valuation = useQuery({
    queryKey: ['dashboard', 'inventory-value'],
    queryFn: () => api.get<InventoryValueData>('/api/v1/dashboard/charts/inventory-value'),
    staleTime: 60_000,
  });

  const lowStock = useQuery({
    queryKey: ['products', 'low-stock'],
    queryFn: () => api.get<unknown>('/api/v1/products/low-stock', { limit: 10 }),
  });

  const lowStockItems = normalizeList<DashboardStats['lowStockAlerts'][number]>(
    lowStock.data,
    10,
  ).items;

  const firstName = user?.fullName?.split(' ')[0] ?? user?.username ?? 'there';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Welcome back, {firstName}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Here is how your inventory is looking right now.
        </p>
      </div>

      {stats.error ? (
        <Alert tone="danger">
          Could not load dashboard data.{' '}
          {stats.error instanceof Error ? stats.error.message : ''}
        </Alert>
      ) : null}

      {/* ------------------------------------------------------------ KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Stock value"
          value={stats.data ? formatCurrency(stats.data.totalStockValue) : '—'}
          hint={stats.data ? `${formatNumber(stats.data.totalStockQuantity)} units on hand` : undefined}
          icon={<DollarSign className="h-5 w-5" />}
          tone="brand"
        />
        <StatCard
          label="Active products"
          value={stats.data ? formatNumber(stats.data.totalProducts) : '—'}
          hint="Across all categories"
          icon={<Package className="h-5 w-5" />}
        />
        <StatCard
          label="Low stock"
          value={stats.data ? formatNumber(stats.data.lowStockItems) : '—'}
          hint={
            stats.data
              ? `${stats.data.outOfStockItems} out of stock`
              : undefined
          }
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={stats.data && stats.data.lowStockItems > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Pending approvals"
          value={stats.data ? formatNumber(stats.data.pendingApprovals) : '—'}
          hint="Awaiting a decision"
          icon={<ClipboardCheck className="h-5 w-5" />}
          tone={stats.data && stats.data.pendingApprovals > 0 ? 'warning' : 'success'}
        />
      </div>

      {/* ------------------------------------------------- Today's activity */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Received today"
          value={stats.data ? formatNumber(stats.data.stockReceivedToday) : '—'}
          hint="Units booked in"
          icon={<ArrowDownToLine className="h-5 w-5" />}
          tone="success"
        />
        <StatCard
          label="Issued today"
          value={stats.data ? formatNumber(stats.data.stockIssuedToday) : '—'}
          hint="Units booked out"
          icon={<ArrowUpFromLine className="h-5 w-5" />}
          tone="warning"
        />
      </div>

      {/* ---------------------------------------------------------- Charts */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card padded={false}>
          <CardHeader title="Stock movement" description="Last 14 days, completed movements" />
          <div className="p-4">
            {movement.isLoading ? (
              <LoadingBlock />
            ) : (
              <StockMovementChart
                labels={movement.data?.labels ?? []}
                received={movement.data?.received ?? []}
                issued={movement.data?.issued ?? []}
              />
            )}
          </div>
        </Card>

        <Card padded={false}>
          <CardHeader title="Stock value by category" description="Top 10 categories" />
          <div className="p-4">
            {valuation.isLoading ? (
              <LoadingBlock />
            ) : (
              <InventoryValueChart data={valuation.data?.data ?? []} />
            )}
          </div>
        </Card>
      </div>

      {/* ----------------------------------------------------------- Lists */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card padded={false}>
          <CardHeader
            title="Low stock alerts"
            description="Items at or below their reorder level"
            actions={
              <Link
                to="/inventory?view=low-stock"
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                View all
              </Link>
            }
          />
          {lowStockItems.length === 0 && !lowStock.isLoading ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">
              Everything is comfortably stocked.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {lowStockItems.map((item) => (
                <li key={`${item.productId}-${item.warehouseName}`} className="flex items-center gap-4 px-5 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{item.productName}</p>
                    <p className="truncate text-xs text-slate-500">
                      {item.sku} · {item.warehouseName}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-sm font-semibold text-slate-900">
                      {formatNumber(item.currentStock)}
                    </p>
                    <p className="text-[11px] text-slate-500">min {formatNumber(item.reorderLevel)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padded={false}>
          <CardHeader
            title="Recent movements"
            description="Latest completed stock transactions"
            actions={
              <Link
                to="/transactions"
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                View all
              </Link>
            }
          />
          {!stats.data ? (
            <LoadingBlock />
          ) : stats.data.recentTransactions.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">No movements recorded yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {stats.data.recentTransactions.map((transaction) => (
                <li key={transaction.id} className="flex items-center gap-4 px-5 py-3">
                  <span
                    className={
                      transaction.type === 'RECEIVED'
                        ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600'
                        : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600'
                    }
                  >
                    <Boxes className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {transaction.productName}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {transaction.warehouseName} · {formatRelative(transaction.createdAt)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={
                        transaction.type === 'RECEIVED'
                          ? 'tabular text-sm font-semibold text-emerald-600'
                          : 'tabular text-sm font-semibold text-amber-600'
                      }
                    >
                      {transaction.type === 'RECEIVED' ? '+' : '−'}
                      {formatNumber(transaction.quantity)}
                    </p>
                    <StatusBadge status={transaction.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* --------------------------------------------------------- Expiring */}
      <Card padded={false}>
        <CardHeader
          title="Expiring soon"
          description="Products expiring within 30 days"
        />
        {!stats.data ? (
          <LoadingBlock />
        ) : stats.data.expiringProducts.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            Nothing is expiring in the next 30 days.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="th">Product</th>
                  <th className="th">SKU</th>
                  <th className="th hidden lg:table-cell">Warehouse</th>
                  <th className="th">Expiry</th>
                  <th className="th text-right">Days left</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.data.expiringProducts.map((product) => (
                  <tr key={product.productId}>
                    <td className="td font-medium text-slate-900">{product.productName}</td>
                    <td className="td font-mono text-xs">{product.sku}</td>
                    <td className="td hidden lg:table-cell">{product.warehouseName || '—'}</td>
                    <td className="td">
                      <span className="flex items-center gap-1.5">
                        <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
                        {formatDate(product.expiryDate)}
                      </span>
                    </td>
                    <td className="td text-right">
                      <span
                        className={
                          product.daysUntilExpiry <= 7
                            ? 'tabular inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700'
                            : product.daysUntilExpiry <= 14
                              ? 'tabular inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700'
                              : 'tabular text-slate-600'
                        }
                      >
                        {product.daysUntilExpiry}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <TrendingUp className="h-3.5 w-3.5" />
        Figures refresh automatically. Last loaded {formatRelative(new Date())}.
      </p>
    </div>
  );
}