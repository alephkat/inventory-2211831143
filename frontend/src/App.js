import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { AuthGate, Layout } from "@/components/Layout";
import { ToastProvider } from "@/lib/ToastProvider";
import { LoginPage } from "@/pages/LoginPage";
import { RegistrationPage } from "@/pages/RegistrationPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { ProductsPage } from "@/pages/ProductsPage";
import { ProductFormPage } from "@/pages/ProductFormPage";
import { CategoriesPage } from "@/pages/CategoriesPage";
import { SuppliersPage } from "@/pages/SuppliersPage";
import { CustomersPage } from "@/pages/CustomersPage";
import { WarehousesPage } from "@/pages/WarehousesPage";
import { InventoryPage } from "@/pages/InventoryPage";
import { TransactionsPage } from "@/pages/TransactionsPage";
import { PurchaseOrdersPage } from "@/pages/PurchaseOrdersPage";
import { SalesOrdersPage } from "@/pages/SalesOrdersPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { AuditLogsPage } from "@/pages/AuditLogsPage";
import { UsersPage } from "@/pages/UsersPage";
import { RolesPage } from "@/pages/RolesPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { NotFoundPage } from "@/pages/NotFoundPage";
function RequireAuth({ children }) {
    const { isAuthenticated } = useAuth();
    const location = useLocation();
    if (!isAuthenticated) {
        return _jsx(Navigate, { to: "/login", replace: true, state: { from: location.pathname } });
    }
    return _jsx(_Fragment, { children: children });
}
function RequirePermission({ permission, children }) {
    const { can } = useAuth();
    if (!can(permission))
        return _jsx(Navigate, { to: "/", replace: true });
    return _jsx(_Fragment, { children: children });
}
function App() {
    return _jsxs(ToastProvider, { children: [_jsx(AuthGate, {}), _jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsx(Route, { path: "/register", element: _jsx(RegistrationPage, {}) }), _jsxs(Route, { element: _jsx(RequireAuth, { children: _jsx(Layout, {}) }), children: [_jsx(Route, { index: true, element: _jsx(DashboardPage, {}) }), _jsx(Route, { path: "products", element: _jsx(ProductsPage, {}) }), _jsx(Route, { path: "products/new", element: _jsx(RequirePermission, { permission: "add_product", children: _jsx(ProductFormPage, {}) }) }), _jsx(Route, { path: "products/:id/edit", element: _jsx(RequirePermission, { permission: "edit_product", children: _jsx(ProductFormPage, {}) }) }), _jsx(Route, { path: "categories", element: _jsx(CategoriesPage, {}) }), _jsx(Route, { path: "suppliers", element: _jsx(RequirePermission, { permission: "manage_suppliers", children: _jsx(SuppliersPage, {}) }) }), _jsx(Route, { path: "customers", element: _jsx(RequirePermission, { permission: "manage_customers", children: _jsx(CustomersPage, {}) }) }), _jsx(Route, { path: "warehouses", element: _jsx(RequirePermission, { permission: "manage_warehouses", children: _jsx(WarehousesPage, {}) }) }), _jsx(Route, { path: "inventory", element: _jsx(InventoryPage, {}) }), _jsx(Route, { path: "transactions", element: _jsx(TransactionsPage, {}) }), _jsx(Route, { path: "purchase-orders", element: _jsx(RequirePermission, { permission: "manage_purchase_orders", children: _jsx(PurchaseOrdersPage, {}) }) }), _jsx(Route, { path: "sales-orders", element: _jsx(RequirePermission, { permission: "manage_sales_orders", children: _jsx(SalesOrdersPage, {}) }) }), _jsx(Route, { path: "reports", element: _jsx(RequirePermission, { permission: "view_reports", children: _jsx(ReportsPage, {}) }) }), _jsx(Route, { path: "audit-logs", element: _jsx(RequirePermission, { permission: "view_audit_logs", children: _jsx(AuditLogsPage, {}) }) }), _jsx(Route, { path: "users", element: _jsx(RequirePermission, { permission: "manage_users", children: _jsx(UsersPage, {}) }) }), _jsx(Route, { path: "roles", element: _jsx(RequirePermission, { permission: "manage_users", children: _jsx(RolesPage, {}) }) }), _jsx(Route, { path: "profile", element: _jsx(ProfilePage, {}) })] }), _jsx(Route, { path: "*", element: _jsx(NotFoundPage, {}) })] })] });
}
export { App as default };
