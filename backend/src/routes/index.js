import { Router } from 'express';
import { requireAuthenticated } from '../shared/middlewares/auth.js';
import { rolesRouter } from '../modules/roles/roles.routes.js';
import { usersRouter } from '../modules/users/users.routes.js';
import { categoriesRouter } from '../modules/categories/categories.routes.js';
import { suppliersRouter } from '../modules/suppliers/suppliers.routes.js';
import { customersRouter } from '../modules/customers/customers.routes.js';
import { warehousesRouter } from '../modules/warehouses/warehouses.routes.js';
import { productsRouter } from '../modules/products/products.routes.js';
import { inventoryRouter } from '../modules/inventory/inventory.routes.js';
import { transactionsRouter } from '../modules/transactions/transactions.routes.js';
import { stockTransfersRouter } from '../modules/stock-transfers/stock-transfers.routes.js';
import { stockIssuesRouter } from '../modules/stock-issues/stock-issues.routes.js';
import { stockAdjustmentsRouter } from '../modules/stock-adjustments/stock-adjustments.routes.js';
import { stockCountsRouter } from '../modules/stock-counts/stock-counts.routes.js';
import { stockReceiptsRouter } from '../modules/stock-receipts/stock-receipts.routes.js';
import { purchaseOrdersRouter } from '../modules/purchase-orders/purchase-orders.routes.js';
import { salesOrdersRouter } from '../modules/sales-orders/sales-orders.routes.js';
import { dashboardRouter } from '../modules/dashboard/dashboard.routes.js';
import { reportsRouter } from '../modules/reports/reports.routes.js';
import { auditLogsRouter } from '../modules/audit-logs/audit-logs.routes.js';
import { notificationsRouter } from '../modules/notifications/notifications.routes.js';

export const registerRoutes = Router();

// All routes below are mounted after requireAuth, so every request is
// authenticated. Authorization is then enforced per-route via
// requirePermission() / requireRole() inside each module router.
registerRoutes.use(requireAuthenticated);

registerRoutes.use('/roles', rolesRouter);
registerRoutes.use('/users', usersRouter);
registerRoutes.use('/categories', categoriesRouter);
registerRoutes.use('/suppliers', suppliersRouter);
registerRoutes.use('/customers', customersRouter);
registerRoutes.use('/warehouses', warehousesRouter);
registerRoutes.use('/products', productsRouter);
registerRoutes.use('/inventory', inventoryRouter);
registerRoutes.use('/transactions', transactionsRouter);
registerRoutes.use('/transfers', stockTransfersRouter);
registerRoutes.use('/issues', stockIssuesRouter);
registerRoutes.use('/adjustments', stockAdjustmentsRouter);
registerRoutes.use('/counts', stockCountsRouter);
registerRoutes.use('/receipts', stockReceiptsRouter);
registerRoutes.use('/purchase-orders', purchaseOrdersRouter);
registerRoutes.use('/sales-orders', salesOrdersRouter);
registerRoutes.use('/dashboard', dashboardRouter);
registerRoutes.use('/reports', reportsRouter);
registerRoutes.use('/audit-logs', auditLogsRouter);
registerRoutes.use('/notifications', notificationsRouter);
