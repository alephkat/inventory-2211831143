import { Router } from 'express';
import { salesOrderService } from './sales-orders.service.js';
import { validate } from '../../shared/middlewares/validate.js';
import { requirePermission } from '../../shared/middlewares/auth.js';
import { getPagination } from '../../shared/utils/response.js';
import { z } from 'zod';

const CreateSOSchema = z.object({
 customerId: z.string().uuid(),
 warehouseId: z.string().uuid(),
 expectedDate: z.coerce.date().optional(),
 currency: z.string().optional(),
 items: z.array(z.object({
 productId: z.string().uuid(),
 quantity: z.number().positive(),
 unitPrice: z.number().nonnegative(),
 })).min(1),
});
const AddItemSchema = z.object({
 productId: z.string().uuid(),
 quantity: z.number().positive(),
 unitPrice: z.number().nonnegative(),
});

export const salesOrdersRouter = Router();

salesOrdersRouter.get('/', requirePermission('manage_sales_orders'), async (req, res, next) => {
 try {
 const pg = getPagination(req.query);
 res.json({ success: true, data: await salesOrderService.list({ ...pg, status: req.query.status as string | undefined, customerId: req.query.customerId as string | undefined, search: req.query.search as string | undefined }) });
 } catch (e) {
 next(e);
 }
});

salesOrdersRouter.get('/:id', requirePermission('manage_sales_orders'), async (req, res, next) => {
 try {
 res.json({ success: true, data: await salesOrderService.get(req.params.id) });
 } catch (e) {
 next(e);
 }
});

salesOrdersRouter.post('/', requirePermission('manage_sales_orders'), validate(CreateSOSchema), async (req, res, next) => {
 try {
 res.status(201).json({ success: true, data: await salesOrderService.create(req.body, req.user!.id) });
 } catch (e) {
 next(e);
 }
});

salesOrdersRouter.post('/items/:id', requirePermission('manage_sales_orders'), validate(AddItemSchema), async (req, res, next) => {
 try {
 res.json({ success: true, data: await salesOrderService.addItem(req.params.id, req.body, req.user!.id) });
 } catch (e) {
 next(e);
 }
});

salesOrdersRouter.delete('/items/:id/:itemId', requirePermission('manage_sales_orders'), async (req, res, next) => {
 try {
 res.json({ success: true, data: await salesOrderService.removeItem(req.params.id, req.params.itemId, req.user!.id) });
 } catch (e) {
 next(e);
 }
});

salesOrdersRouter.post('/:id/submit', requirePermission('approve_transactions'), async (req, res, next) => {
 try {
 res.json({ success: true, data: await salesOrderService.submit(req.params.id, req.user!.id) });
 } catch (e) {
 next(e);
 }
});

salesOrdersRouter.post('/:id/approve', requirePermission('approve_transactions'), async (req, res, next) => {
 try {
 res.json({ success: true, data: await salesOrderService.approve(req.params.id, req.user!.id) });
 } catch (e) {
 next(e);
 }
});

salesOrdersRouter.post('/:id/issue', requirePermission('issue_stock'), async (req, res, next) => {
 try {
 const items = Array.isArray(req.body.items) ? req.body.items : [{ itemId: req.body.itemId, quantity: req.body.quantity }];
 res.json({ success: true, data: await salesOrderService.issue(req.params.id, req.user!.id, items) });
 } catch (e) {
 next(e);
 }
});

salesOrdersRouter.post('/:id/ship', requirePermission('manage_sales_orders'), async (req, res, next) => {
 try {
 res.json({ success: true, data: await salesOrderService.ship(req.params.id, req.user!.id) });
 } catch (e) {
 next(e);
 }
});

salesOrdersRouter.post('/:id/deliver', requirePermission('manage_sales_orders'), async (req, res, next) => {
 try {
 res.json({ success: true, data: await salesOrderService.deliver(req.params.id, req.user!.id) });
 } catch (e) {
 next(e);
 }
});

salesOrdersRouter.post('/:id/cancel', requirePermission('manage_sales_orders'), async (req, res, next) => {
 try {
 res.json({ success: true, data: await salesOrderService.cancel(req.params.id, req.user!.id) });
 } catch (e) {
 next(e);
 }
});
