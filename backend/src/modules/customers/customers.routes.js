import { Router } from 'express';
import { customerService } from './customers.service.js';
import { validate } from '../../shared/middlewares/validate.js';
import { requirePermission } from '../../shared/middlewares/auth.js';
import { getPagination } from '../../shared/utils/response.js';
import { z } from 'zod';
const CustomerSchema = z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    contactPerson: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    email: z.string().email().optional().nullable(),
    address: z.string().optional().nullable(),
    taxId: z.string().optional().nullable(),
    paymentTerms: z.string().optional().nullable(),
    isActive: z.boolean().default(true),
});
const UpdateCustomerSchema = CustomerSchema.partial();
export const customersRouter = Router();
customersRouter.use(requirePermission('manage_customers'));
customersRouter.get('/', async (req, res, next) => {
    try {
        res.json({ success: true, data: await customerService.list({ ...getPagination(req.query), search: req.query.search }) });
    }
    catch (e) {
        next(e);
    }
});
customersRouter.get('/:id', async (req, res, next) => {
    try {
        res.json({ success: true, data: await customerService.get(req.params.id) });
    }
    catch (e) {
        next(e);
    }
});
customersRouter.post('/', validate(CustomerSchema), async (req, res, next) => {
    try {
        res.status(201).json({ success: true, data: await customerService.create(req.body, req.user.id) });
    }
    catch (e) {
        next(e);
    }
});
customersRouter.put('/:id', validate(UpdateCustomerSchema), async (req, res, next) => {
    try {
        res.json({ success: true, data: await customerService.update(req.params.id, req.body) });
    }
    catch (e) {
        next(e);
    }
});
customersRouter.delete('/:id', async (req, res, next) => {
    try {
        res.json({ success: true, data: await customerService.delete(req.params.id, req.user.id) });
    }
    catch (e) {
        next(e);
    }
});
