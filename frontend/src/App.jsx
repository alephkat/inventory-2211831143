import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { AuthGate, Layout } from "@/components/Layout";
import { ToastProvider } from "@/lib/ToastProvider";

const LoginPage = lazy(() => import("@/pages/LoginPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const ProductsPage = lazy(() => import("@/pages/ProductsPage"));
const ProductFormPage = lazy(() => import("@/pages/ProductFormPage"));
const CategoriesPage = lazy(() => import("@/pages/CategoriesPage"));
const SuppliersPage = lazy(() => import("@/pages/SuppliersPage"));
const CustomersPage = lazy(() => import("@/pages/CustomersPage"));
const WarehousesPage = lazy(() => import("@/pages/WarehousesPage"));
const InventoryPage = lazy(() => import("@/pages/InventoryPage"));
const TransactionsPage = lazy(() => import("@/pages/TransactionsPage"));
const PurchaseOrdersPage = lazy(() => import("@/pages/PurchaseOrdersPage"));
const SalesOrdersPage = lazy(() => import("@/pages/SalesOrdersPage"));
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
const AuditLogsPage = lazy(() => import("@/pages/AuditLogsPage"));
const UsersPage = lazy(() => import("@/pages/UsersPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"));

function PageFallback() {
  return <div className="flex min-h-[300px] items-center justify-center bg-surface">
    <div className="flex flex-col items-center gap-3">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white animate-pulse">
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </span>
      <p className="text-sm text-slate-500">Loading page…</p>
    </div>
  </div>;
}

function RequireAuth({ children }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

function RequirePermission({ permission, children }) {
  const { can } = useAuth();
  if (!can(permission)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function App() {
  return <ToastProvider>
      <AuthGate />
      <Suspense fallback={<PageFallback />}>
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

            <Route path="profile" element={<ProfilePage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ToastProvider>;
}
export {
  App as default
};