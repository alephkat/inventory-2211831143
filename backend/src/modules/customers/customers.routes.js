import { Router } from 'express';
import { customerService } from './customers.service.js';
import { validate } from '../../shared/middlewares/validate.js';
import { requirePermission } from '../../shared/middlewares/auth.js';
import { getPagination } from '../../shared/utils/response.js';
import { z } from 'zod';
import { zambianPhone } from '../../shared/schemas/phone.js';
const CustomerSchema = z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    contactPerson: z.string().optional().nullable(),
    phone: zambianPhone,
    email: z.string().email().optional().nullable(),
    address: z.string().optional().nullable(),
    taxId: z.string().optional().nullable(),
    paymentTerms: z.string().optional().nullable(),
    isActive: z.boolean().default(true),
});
const UpdateCustomerSchema = CustomerSchema.partial();
export const customersRouter = Router();
// Reads only need the view permission; every mutation and workflow
// transition needs the manage permission.
customersRouter.get('/', requirePermission(['view_customers', 'manage_customers']), async (req, res, next) => {
    try {
        res.json({ success: true, data: await customerService.list({ ...getPagination(req.query), search: req.query.search }) });
    }
    catch (e) {
        next(e);
    }
});
customersRouter.get('/:id', requirePermission(['view_customers', 'manage_customers']), async (req, res, next) => {
    try {
        res.json({ success: true, data: await customerService.get(req.params.id) });
    }
    catch (e) {
        next(e);
    }
});
customersRouter.post('/', requirePermission('manage_customers'), validate(CustomerSchema), async (req, res, next) => {
    try {
        res.status(201).json({ success: true, data: await customerService.create(req.body, req.user.id) });
    }
    catch (e) {
        next(e);
    }
});
customersRouter.put('/:id', requirePermission('manage_customers'), validate(UpdateCustomerSchema), async (req, res, next) => {
    try {
        res.json({ success: true, data: await customerService.update(req.params.id, req.body) });
    }
    catch (e) {
        next(e);
    }
});
customersRouter.delete('/:id', requirePermission('manage_customers'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await customerService.delete(req.params.id, req.user.id) });
    }
    catch (e) {
        next(e);
    }
});
