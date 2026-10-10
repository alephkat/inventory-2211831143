/**
 * Canonical permission registry.
 * Values match the Dart `Permission` enum in the mobile app so frontend and
 * backend share a single source of truth for authorization semantics.
 *
 * Each workflow has a permission to *propose* a document and a separate one to
 * *approve* it. Collapsing those into one would let a storekeeper approve
 * their own receiving, which defeats the point of an approval queue.
 */
export const PERMISSIONS = [
    { value: 'view_inventory', name: 'View Inventory', description: 'View inventory and stock levels', resource: 'inventory' },
    { value: 'add_product', name: 'Add Product', description: 'Create products', resource: 'product' },
    { value: 'edit_product', name: 'Edit Product', description: 'Update products', resource: 'product' },
    { value: 'delete_product', name: 'Delete Product', description: 'Delete products', resource: 'product' },
    { value: 'receive_stock', name: 'Receive Stock', description: 'Book received stock into a warehouse', resource: 'inventory' },
    { value: 'issue_stock', name: 'Issue Stock', description: 'Remove stock from a warehouse', resource: 'inventory' },
    { value: 'transfer_stock', name: 'Transfer Stock', description: 'Transfer stock between warehouses', resource: 'inventory' },
    { value: 'adjust_stock', name: 'Adjust Stock', description: 'Propose and post stock adjustments', resource: 'inventory' },
    { value: 'count_stock', name: 'Count Stock', description: 'Run cycle counts and record counted quantities', resource: 'inventory' },
    { value: 'manage_stock_receipts', name: 'Manage Stock Receipts', description: 'Raise and cancel stock receipts', resource: 'receipt' },
    { value: 'approve_stock_receipts', name: 'Approve Stock Receipts', description: 'Approve or reject stock receipts', resource: 'receipt' },
    { value: 'approve_stock_issues', name: 'Approve Stock Issues', description: 'Approve or reject stock issues', resource: 'issue' },
    { value: 'override_stock_issue', name: 'Override Stock Issue', description: 'Issue stock beyond the requested quantity', resource: 'issue' },
    { value: 'approve_stock_counts', name: 'Approve Stock Counts', description: 'Review, approve and post cycle counts', resource: 'count' },
    { value: 'manage_suppliers', name: 'Manage Suppliers', description: 'CRUD suppliers and their approval', resource: 'supplier' },
    { value: 'manage_users', name: 'Manage Users', description: 'CRUD users and roles', resource: 'user' },
    { value: 'view_reports', name: 'View Reports', description: 'View analytics and reports', resource: 'report' },
    { value: 'export_reports', name: 'Export Reports', description: 'Export reports to files', resource: 'report' },
    { value: 'approve_transactions', name: 'Approve Transactions', description: 'Approve transfers, adjustments and orders', resource: 'approval' },
    { value: 'manage_categories', name: 'Manage Categories', description: 'CRUD categories', resource: 'category' },
    { value: 'manage_warehouses', name: 'Manage Warehouses', description: 'CRUD warehouses', resource: 'warehouse' },
    { value: 'manage_customers', name: 'Manage Customers', description: 'CRUD customers', resource: 'customer' },
    { value: 'manage_purchase_orders', name: 'Manage Purchase Orders', description: 'CRUD purchase orders', resource: 'purchase_order' },
    { value: 'manage_sales_orders', name: 'Manage Sales Orders', description: 'CRUD sales orders', resource: 'sales_order' },
    { value: 'view_audit_logs', name: 'View Audit Logs', description: 'View audit trail', resource: 'audit' },
    { value: 'system_settings', name: 'System Settings', description: 'Configure system settings', resource: 'settings' },
];
export const PERMISSION_VALUES = PERMISSIONS.map((p) => p.value);

/**
 * The fixed set of roles of this single-company deployment, in the order they
 * appear in the UI. Roles live on the user row (see the `UserRole` enum in
 * schema.prisma); this map is the only place that decides what a role can do.
 */
export const ROLES = [
    { value: 'super_admin', name: 'Super Admin', description: 'Full system access' },
    { value: 'admin', name: 'Admin', description: 'Administrative access' },
    { value: 'inventory_manager', name: 'Inventory Manager', description: 'Manage inventory operations and approve stock movements' },
    { value: 'storekeeper', name: 'Storekeeper', description: 'Handle stock movements' },
    { value: 'procurement_officer', name: 'Procurement Officer', description: 'Manage purchasing and supplier onboarding' },
    { value: 'sales_officer', name: 'Sales Officer', description: 'Manage sales' },
    { value: 'auditor', name: 'Auditor', description: 'View and audit data' },
    { value: 'read_only', name: 'Read Only', description: 'Read-only access' },
];
export const ROLE_VALUES = ROLES.map((r) => r.value);

/**
 * Permission grants per role.
 *
 * Each workflow is split between a permission that lets a role *propose* a
 * document and one that lets it *approve* it. A role never gets both for the
 * same workflow unless it is an administrator, so the approval queue stays a
 * real second pair of eyes rather than self-approval.
 */
const ALL = PERMISSION_VALUES;
export const ROLE_PERMISSIONS = {
    super_admin: ALL,
    admin: ALL,
    inventory_manager: [
        'view_inventory', 'add_product', 'edit_product', 'delete_product',
        'receive_stock', 'issue_stock', 'transfer_stock', 'adjust_stock', 'count_stock',
        'manage_stock_receipts', 'approve_stock_receipts', 'approve_stock_issues',
        'override_stock_issue', 'approve_stock_counts', 'approve_transactions',
        'manage_suppliers', 'manage_categories', 'manage_warehouses', 'manage_customers',
        'manage_purchase_orders', 'view_reports', 'export_reports',
    ],
    storekeeper: [
        'view_inventory', 'receive_stock', 'issue_stock', 'transfer_stock',
        'count_stock', 'manage_stock_receipts', 'adjust_stock', 'view_reports',
    ],
    procurement_officer: [
        'view_inventory', 'manage_suppliers', 'manage_purchase_orders',
        'manage_stock_receipts', 'view_reports', 'export_reports',
    ],
    sales_officer: [
        'view_inventory', 'manage_customers', 'manage_sales_orders',
        'issue_stock', 'view_reports',
    ],
    auditor: ['view_inventory', 'view_reports', 'export_reports', 'view_audit_logs'],
    read_only: ['view_inventory'],
};

/**
 * Permissions granted to a role. Falls back to the read-only set so an
 * unknown role can never silently inherit everything.
 */
export function permissionsForRole(role) {
    return ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.read_only;
}
