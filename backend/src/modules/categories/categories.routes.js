import { Router } from 'express';
import { categoryService } from './categories.service.js';
import { validate } from '../../shared/middlewares/validate.js';
import { requirePermission } from '../../shared/middlewares/auth.js';
import { getPagination } from '../../shared/utils/response.js';
import { z } from 'zod';

const CategorySchema = z.object({
 name: z.string().min(1),
 description: z.string().optional(),
 parentId: z.string().uuid().optional().nullable(),
 imageUrl: z.string().url().optional().nullable(),
 isActive: z.boolean().default(true),
});
const UpdateCategorySchema = CategorySchema.partial();

export const categoriesRouter = Router();

categoriesRouter.get('/', requirePermission('view_inventory'), async (req, res, next) => {
 try {
 const pg = getPagination(req.query);
 res.json({ success: true, data: await categoryService.list({ ...pg, search: req.query.search as string | undefined }), message: null, meta: null });
 } catch (e) { next(e); }
});

categoriesRouter.get('/:id', requirePermission('view_inventory'), async (req, res, next) => {
 try { res.json({ success: true, data: await categoryService.get(req.params.id) }); } catch (e) { next(e); }
});

categoriesRouter.post('/', requirePermission('manage_categories'), validate(CategorySchema), async (req, res, next) => {
 try { res.status(201).json({ success: true, data: await categoryService.create(req.body, req.user.id) }); } catch (e) { next(e); }
});

categoriesRouter.put('/:id', requirePermission('manage_categories'), validate(UpdateCategorySchema), async (req, res, next) => {
 try { res.json({ success: true, data: await categoryService.update(req.params.id, req.body) }); } catch (e) { next(e); }
});

categoriesRouter.delete('/:id', requirePermission('manage_categories'), async (req, res, next) => {
 try { res.json({ success: true, data: await categoryService.delete(req.params.id, req.user.id) }); } catch (e) { next(e); }
});
