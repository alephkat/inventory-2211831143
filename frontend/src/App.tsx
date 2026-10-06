import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { AuthGate, Layout } from '@/components/Layout';
import { ToastProvider } from '@/lib/ToastProvider';

import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ProductsPage } from '@/pages/ProductsPage';
import { ProductFormPage } from '@/pages/ProductFormPage';
import { CategoriesPage } from '@/pages/CategoriesPage';
import { SuppliersPage } from '@/pages/SuppliersPage';
import { CustomersPage } from '@/pages/CustomersPage';
import { WarehousesPage } from '@/pages/WarehousesPage';
import { InventoryPage } from '@/pages/InventoryPage';
import { TransactionsPage } from '@/pages/TransactionsPage';
import { PurchaseOrdersPage } from '@/pages/PurchaseOrdersPage';
import { SalesOrdersPage } from '@/pages/SalesOrdersPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { AuditLogsPage } from '@/pages/AuditLogsPage';
import { UsersPage } from '@/pages/UsersPage';
import { RolesPage } from '@/pages/RolesPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { NotFoundPage } from '@/pages/NotFoundPage';

/**
 * Route guard. The server enforces permissions on every endpoint, so this only
 * has to decide what to *render*: an unauthorised user is sent to the dashboard
 * rather than shown an empty page that will 403 on load.
 */
function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

function RequirePermission({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const { can } = useAuth();
  if (!can(permission)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthGate />
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />

          <Route path="products" element={<ProductsPage />} />
          <Route
            path="products/new"
            element={
              <RequirePermission permission="add_product">
                <ProductFormPage />
              </RequirePermission>
            }
          />
          <Route
            path="products/:id/edit"
            element={
              <RequirePermission permission="edit_product">
                <ProductFormPage />
              </RequirePermission>
            }
          />

          <Route path="categories" element={<CategoriesPage />} />
          <Route
            path="suppliers"
            element={
              <RequirePermission permission="manage_suppliers">
                <SuppliersPage />
              </RequirePermission>
            }
          />
          <Route
            path="customers"
            element={
              <RequirePermission permission="manage_customers">
                <CustomersPage />
              </RequirePermission>
            }
          />

          <Route
            path="warehouses"
            element={
              <RequirePermission permission="manage_warehouses">
                <WarehousesPage />
              </RequirePermission>
            }
          />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="transactions" element={<TransactionsPage />} />

          <Route
            path="purchase-orders"
            element={
              <RequirePermission permission="manage_purchase_orders">
                <PurchaseOrdersPage />
              </RequirePermission>
            }
          />
          <Route
            path="sales-orders"
            element={
              <RequirePermission permission="manage_sales_orders">
                <SalesOrdersPage />
              </RequirePermission>
            }
          />

          <Route
            path="reports"
            element={
              <RequirePermission permission="view_reports">
                <ReportsPage />
              </RequirePermission>
            }
          />
          <Route
            path="audit-logs"
            element={
              <RequirePermission permission="view_audit_logs">
                <AuditLogsPage />
              </RequirePermission>
            }
          />

          <Route
            path="users"
            element={
              <RequirePermission permission="manage_users">
                <UsersPage />
              </RequirePermission>
            }
          />
          <Route
            path="roles"
            element={
              <RequirePermission permission="manage_users">
                <RolesPage />
              </RequirePermission>
            }
          />

          <Route path="profile" element={<ProfilePage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ToastProvider>
  );
}