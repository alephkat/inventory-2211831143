import { Router } from 'express';
import { z } from 'zod';
import { supplierService } from './suppliers.service.js';
import { validate } from '../../shared/middlewares/validate.js';
import { asyncHandler } from '../../shared/middlewares/asyncHandler.js';
import { requirePermission } from '../../shared/middlewares/auth.js';
import { getPagination, sendPaginated, sendSuccess } from '../../shared/utils/response.js';

/**
 * Supplier HTTP surface.
 *
 * Every endpoint is gated on `manage_suppliers`, including the workflow
 * transitions: approving or blacklisting a supplier is a purchasing decision
 * and needs the same privilege as editing the supplier record itself.
 */

const optionalText = z.string().trim().min(1).nullable().optional();

const CreateSupplierSchema = z.object({
 name: z.string().trim().min(1, 'Supplier name is required'),
 code: z.string().trim().min(1).nullable().optional(),
 contactPerson: optionalText,
 phone: optionalText,
 email: z.string().trim().email().nullable().optional(),
 address: optionalText,
 taxId: optionalText,
 paymentTerms: optionalText,
});

/**
 * `status` is deliberately absent: the workflow endpoints are the only way to
 * move a supplier, so that every change is guarded, audited and attributed.
 */
const UpdateSupplierSchema = CreateSupplierSchema.partial();

const ReasonSchema = z.object({
 reason: z.string().trim().min(1, 'A reason is required').optional(),
 rejectionReason: z.string().trim().min(1, 'A reason is required').optional(),
});

const ListQuerySchema = z.object({
 page: z.coerce.number().int().positive().optional(),
 limit: z.coerce.number().int().positive().max(100).optional(),
 status: z
 .enum(['PENDING_APPROVAL', 'ACTIVE', 'INACTIVE', 'REJECTED', 'BLACKLISTED'])
 .optional(),
 isActive: z
 .enum(['true', 'false'])
 .transform((value) => value === 'true')
 .optional(),
 search: z.string().trim().min(1).optional(),
});

const CatalogueEntrySchema = z.object({
 productId: z.string().uuid(),
 supplierSku: z.string().trim().min(1).nullable().optional(),
 supplierPrice: z.number().nonnegative().nullable().optional(),
 leadTimeDays: z.number().int().nonnegative().nullable().optional(),
 minOrderQty: z.number().nonnegative().nullable().optional(),
 isPreferred: z.boolean().optional(),
});

const SetProductsSchema = z.object({
 products: z.array(CatalogueEntrySchema),
});

export const suppliersRouter = Router();

suppliersRouter.use(requirePermission('manage_suppliers'));

suppliersRouter.get(
 '/',
 validate(ListQuerySchema, 'query'),
 asyncHandler(async (req, res) => {
 const { page, limit } = getPagination(req.query);
 const { status, isActive, search } = req.query as {
 status?;
 isActive?;
 search?;
 };
 const result = await supplierService.list({ page, limit, status, isActive, search });
 res.json(sendPaginated(result.items, result.total, result.page, result.limit));
 }));

suppliersRouter.get(
 '/:id',
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await supplierService.get(req.params.id)));
 }));

suppliersRouter.post(
 '/',
 validate(CreateSupplierSchema),
 asyncHandler(async (req, res) => {
 const created = await supplierService.create(req.body, req.user!.id);
 res.status(201).json(sendSuccess(created, 'Supplier submitted for approval'));
 }));

suppliersRouter.put(
 '/:id',
 validate(UpdateSupplierSchema),
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await supplierService.update(req.params.id, req.body, req.user!.id)));
 }));

suppliersRouter.delete(
 '/:id',
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await supplierService.remove(req.params.id, req.user!.id), 'Supplier deleted'));
 }));

suppliersRouter.get(
 '/:id/products',
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await supplierService.products(req.params.id)));
 }));

suppliersRouter.put(
 '/:id/products',
 validate(SetProductsSchema),
 asyncHandler(async (req, res) => {
 res.json(
 sendSuccess(
 await supplierService.setProducts(req.params.id, req.body, req.user!.id),
 'Supplier catalogue updated'));
 }));

suppliersRouter.post(
 '/:id/approve',
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await supplierService.approve(req.params.id, req.user!.id), 'Supplier approved'));
 }));

suppliersRouter.post(
 '/:id/reject',
 validate(ReasonSchema),
 asyncHandler(async (req, res) => {
 const reason = req.body.rejectionReason ?? req.body.reason;
 res.json(sendSuccess(await supplierService.reject(req.params.id, req.user!.id, reason), 'Supplier rejected'));
 }));

suppliersRouter.post(
 '/:id/deactivate',
 validate(ReasonSchema),
 asyncHandler(async (req, res) => {
 const reason = req.body.reason ?? req.body.rejectionReason;
 res.json(sendSuccess(await supplierService.deactivate(req.params.id, req.user!.id, reason), 'Supplier deactivated'));
 }));

suppliersRouter.post(
 '/:id/reactivate',
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await supplierService.reactivate(req.params.id, req.user!.id), 'Supplier reactivated'));
 }));

suppliersRouter.post(
 '/:id/blacklist',
 validate(ReasonSchema),
 asyncHandler(async (req, res) => {
 const reason = req.body.reason ?? req.body.rejectionReason;
 res.json(sendSuccess(await supplierService.blacklist(req.params.id, req.user!.id, reason), 'Supplier blacklisted'));
 }));

suppliersRouter.post(
 '/:id/reinstate',
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await supplierService.reinstate(req.params.id, req.user!.id), 'Supplier reinstated for review'));
 }));
