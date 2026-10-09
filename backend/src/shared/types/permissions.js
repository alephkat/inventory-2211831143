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
