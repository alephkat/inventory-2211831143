import { Prisma, SupplierStatus } from '@prisma/client';
import { prisma } from '../../shared/config/database.js';
import { ApiError } from '../../shared/errors/ApiError.js';
import { createAuditLog } from '../../shared/utils/audit.js';
import { assertNoDuplicateLines, assertRejectionReason, runTransition, WORKFLOW_RESOURCE } from '../../shared/workflow/index.js';
/**
 * Supplier onboarding and lifecycle.
 *
 * A supplier is created unapproved and is not usable until a reviewer signs
 * it off, because purchase orders and receipts may only be raised against an
 * `ACTIVE` supplier. The lifecycle is therefore:
 *
 *   PENDING_APPROVAL -> ACTIVE | REJECTED | BLACKLISTED
 *   ACTIVE           -> INACTIVE | BLACKLISTED
 *   INACTIVE         -> ACTIVE | BLACKLISTED
 *   REJECTED         -> PENDING_APPROVAL | ACTIVE
 *   BLACKLISTED      -> PENDING_APPROVAL | ACTIVE
 *
 * `status` is only ever moved through `runTransition`, so the legal moves live
 * in the shared `supplierWorkflow` table rather than in ad-hoc `if` checks.
 * Every transition also stamps who reviewed the record and when, and the
 * decision reason is kept on the supplier for rejections and blacklists.
 */
const SUPPLIER_INCLUDE = {
    supplierProducts: {
        include: {
            product: {
                select: {
                    id: true,
                    sku: true,
                    name: true,
                    unit: true,
                    status: true,
                    category: { select: { id: true, name: true } },
                },
            },
        },
        orderBy: { createdAt: 'asc' },
    },
    reviewedBy: { select: { id: true, fullName: true, username: true } },
};
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isUniqueViolation = (error, field) => error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    String(error.meta?.target ?? '').includes(field);
const assertName = (name) => {
    if (typeof name !== 'string' || name.trim().length === 0) {
        throw ApiError.badRequest('Supplier name is required');
    }
    return name.trim();
};
const assertEmail = (email) => {
    if (email === undefined || email === null || email === '')
        return null;
    if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
        throw ApiError.badRequest('A valid email address is required');
    }
    return email.trim();
};
export class SupplierService {
    async list(params) {
        const { page, limit, status, isActive, search } = params;
        const where = {};
        if (status)
            where.status = status;
        if (isActive !== undefined)
            where.isActive = isActive;
        if (search) {
            where.OR = [{ name: { contains: search } }, { code: { contains: search } }];
        }
        const [items, total] = await Promise.all([
            prisma.supplier.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                include: { reviewedBy: { select: { id: true, fullName: true } } },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.supplier.count({ where }),
        ]);
        return { items, total, page, limit };
    }
    async get(id) {
        const supplier = await prisma.supplier.findUnique({
            where: { id },
            include: SUPPLIER_INCLUDE,
        });
        if (!supplier)
            throw ApiError.notFound('Supplier not found');
        return supplier;
    }
    /**
     * New suppliers land in `PENDING_APPROVAL` and start inactive, even though
     * the column default is `true`. Approval is the single gate that makes a
     * supplier usable, so an unapproved record must not be selectable in any
     * list that only filters on `isActive`; otherwise an unvetted supplier would
     * be orderable before anyone reviewed it.
     */
    async create(data, userId) {
        const name = assertName(data.name);
        const email = assertEmail(data.email);
        const code = data.code?.trim() || null;
        const supplier = await prisma.supplier
            .create({
            data: {
                name,
                code,
                contactPerson: data.contactPerson ?? null,
                phone: data.phone ?? null,
                email,
                address: data.address ?? null,
                taxId: data.taxId ?? null,
                paymentTerms: data.paymentTerms ?? null,
                status: SupplierStatus.PENDING_APPROVAL,
                isActive: false,
            },
        })
            .catch((error) => {
            if (code && isUniqueViolation(error, 'code')) {
                throw ApiError.conflict(`Supplier code ${code} is already in use`);
            }
            throw error;
        });
        await createAuditLog({
            userId,
            action: 'CREATE',
            resourceType: WORKFLOW_RESOURCE.supplier,
            resourceId: supplier.id,
            newValues: { status: supplier.status, isActive: supplier.isActive, name: supplier.name, code: supplier.code },
        });
        return this.get(supplier.id);
    }
    /**
     * Contact and commercial details only. Status moves exclusively through the
     * workflow endpoints, otherwise the audit trail, reviewer stamp and
     * concurrency guard in `runTransition` would all be bypassed.
     */
    async update(id, data, userId) {
        if ('status' in data) {
            throw ApiError.badRequest('Supplier status cannot be set directly; use the workflow endpoints');
        }
        const existing = await this.get(id);
        const patch = {};
        if (data.name !== undefined)
            patch.name = assertName(data.name);
        if (data.code !== undefined)
            patch.code = data.code?.trim() || null;
        if (data.contactPerson !== undefined)
            patch.contactPerson = data.contactPerson;
        if (data.phone !== undefined)
            patch.phone = data.phone;
        if (data.email !== undefined)
            patch.email = assertEmail(data.email);
        if (data.address !== undefined)
            patch.address = data.address;
        if (data.taxId !== undefined)
            patch.taxId = data.taxId;
        if (data.paymentTerms !== undefined)
            patch.paymentTerms = data.paymentTerms;
        await prisma.supplier
            .update({ where: { id }, data: patch })
            .catch((error) => {
            if (patch.code && isUniqueViolation(error, 'code')) {
                throw ApiError.conflict(`Supplier code ${patch.code} is already in use`);
            }
            throw error;
        });
        await createAuditLog({
            userId,
            action: 'UPDATE',
            resourceType: WORKFLOW_RESOURCE.supplier,
            resourceId: id,
            oldValues: { name: existing.name, code: existing.code, email: existing.email },
            newValues: { ...patch },
        });
        return this.get(id);
    }
    /** Signs a supplier on. Accepts a fresh submission or a reinstated record. */
    async approve(id, userId) {
        const supplier = await this.get(id);
        await runTransition({
            workflow: 'supplier',
            model: 'supplier',
            entityId: id,
            from: supplier.status,
            to: SupplierStatus.ACTIVE,
            verb: 'approve',
            actorId: userId,
            reference: supplier.code,
            patch: {
                isActive: true,
                reviewedById: userId,
                reviewedAt: new Date(),
                rejectionReason: null,
            },
        });
        return this.get(id);
    }
    /** A rejected supplier keeps its history but stays out of every picker. */
    async reject(id, userId, reason) {
        const supplier = await this.get(id);
        const rejectionReason = assertRejectionReason(reason);
        await runTransition({
            workflow: 'supplier',
            model: 'supplier',
            entityId: id,
            from: supplier.status,
            to: SupplierStatus.REJECTED,
            verb: 'reject',
            actorId: userId,
            reference: supplier.code,
            reason: rejectionReason,
            patch: {
                isActive: false,
                reviewedById: userId,
                reviewedAt: new Date(),
                rejectionReason,
            },
        });
        return this.get(id);
    }
    /**
     * Deactivating is a temporary, reversible pause: the supplier keeps its
     * orders and catalogue and can be switched back on without re-review.
     */
    async deactivate(id, userId, reason) {
        const supplier = await this.get(id);
        await runTransition({
            workflow: 'supplier',
            model: 'supplier',
            entityId: id,
            from: supplier.status,
            to: SupplierStatus.INACTIVE,
            verb: 'deactivate',
            actorId: userId,
            reference: supplier.code,
            reason: reason ?? null,
            patch: { isActive: false },
            notify: false,
        });
        return this.get(id);
    }
    async reactivate(id, userId) {
        const supplier = await this.get(id);
        await runTransition({
            workflow: 'supplier',
            model: 'supplier',
            entityId: id,
            from: supplier.status,
            to: SupplierStatus.ACTIVE,
            verb: 'reactivate',
            actorId: userId,
            reference: supplier.code,
            patch: { isActive: true, rejectionReason: null },
            notify: false,
        });
        return this.get(id);
    }
    /**
     * Blacklisting is the strongest move available: the supplier is off the
     * books for good unless someone deliberately reinstates it. The reason is
     * mandatory because it is the record of why trading was stopped.
     */
    async blacklist(id, userId, reason) {
        const supplier = await this.get(id);
        const rejectionReason = assertRejectionReason(reason);
        await runTransition({
            workflow: 'supplier',
            model: 'supplier',
            entityId: id,
            from: supplier.status,
            to: SupplierStatus.BLACKLISTED,
            verb: 'blacklist',
            actorId: userId,
            reference: supplier.code,
            reason: rejectionReason,
            patch: {
                isActive: false,
                reviewedById: userId,
                reviewedAt: new Date(),
                rejectionReason,
            },
            notify: false,
        });
        return this.get(id);
    }
    /**
     * Puts a blacklisted or rejected supplier back into the review queue rather
     * than straight to active, so the decision to trade with it again is made
     * deliberately and recorded like any other onboarding.
     */
    async reinstate(id, userId) {
        const supplier = await this.get(id);
        await runTransition({
            workflow: 'supplier',
            model: 'supplier',
            entityId: id,
            from: supplier.status,
            to: SupplierStatus.PENDING_APPROVAL,
            verb: 'reinstate',
            actorId: userId,
            reference: supplier.code,
            patch: { isActive: false, rejectionReason: null },
            notify: false,
        });
        return this.get(id);
    }
    /**
     * Hard delete is only for records with no trading history. A supplier that
     * has been ordered from must stay on the books - blacklist it instead - so
     * past purchase orders and receipts keep pointing at a real supplier.
     */
    async remove(id, userId) {
        const supplier = await this.get(id);
        const [purchaseOrders, receipts, products] = await Promise.all([
            prisma.purchaseOrder.count({ where: { supplierId: id } }),
            prisma.stockReceipt.count({ where: { supplierId: id } }),
            prisma.product.count({ where: { supplierId: id } }),
        ]);
        const blockers = [];
        if (purchaseOrders > 0)
            blockers.push(`${purchaseOrders} purchase order(s)`);
        if (receipts > 0)
            blockers.push(`${receipts} stock receipt(s)`);
        if (products > 0)
            blockers.push(`${products} product(s)`);
        if (blockers.length > 0) {
            throw ApiError.conflict(`Supplier cannot be deleted: still referenced by ${blockers.join(', ')}. Blacklist the supplier instead so its history stays intact.`);
        }
        await prisma.supplier.delete({ where: { id } });
        await createAuditLog({
            userId,
            action: 'DELETE',
            resourceType: WORKFLOW_RESOURCE.supplier,
            resourceId: id,
            oldValues: { name: supplier.name, code: supplier.code, status: supplier.status },
        });
        return { id, deleted: true };
    }
    /**
     * Replaces the whole catalogue in one transaction: rows that are still
     * listed are updated in place, rows that are no longer listed are removed.
     * Partial application is never acceptable here - a half-written catalogue
     * would silently change what gets ordered from this supplier.
     */
    async setProducts(supplierId, data, userId) {
        await this.get(supplierId);
        const lines = data.products ?? [];
        assertNoDuplicateLines(lines, (line) => line.productId, 'supplier product');
        if (lines.length > 0) {
            const productIds = [...new Set(lines.map((line) => line.productId))];
            const found = await prisma.product.findMany({
                where: { id: { in: productIds } },
                select: { id: true },
            });
            if (found.length !== productIds.length) {
                throw ApiError.badRequest('One or more catalogue entries reference an unknown product');
            }
        }
        const before = await prisma.supplierProduct.findMany({
            where: { supplierId },
            select: { productId: true },
        });
        await prisma.$transaction(async (tx) => {
            const keep = lines.map((line) => line.productId);
            await tx.supplierProduct.deleteMany({
                where: { supplierId, productId: { notIn: keep } },
            });
            for (const line of lines) {
                const payload = {
                    supplierSku: line.supplierSku ?? null,
                    supplierPrice: line.supplierPrice ?? null,
                    leadTimeDays: line.leadTimeDays ?? null,
                    minOrderQty: line.minOrderQty ?? null,
                    isPreferred: line.isPreferred ?? false,
                };
                await tx.supplierProduct.upsert({
                    where: { supplierId_productId: { supplierId, productId: line.productId } },
                    create: { supplierId, productId: line.productId, ...payload },
                    update: payload,
                });
            }
        });
        await createAuditLog({
            userId,
            action: 'UPDATE',
            resourceType: WORKFLOW_RESOURCE.supplier,
            resourceId: supplierId,
            oldValues: { productCount: before.length },
            newValues: { productCount: lines.length },
        });
        return this.products(supplierId);
    }
    async products(supplierId) {
        await this.get(supplierId);
        return prisma.supplierProduct.findMany({
            where: { supplierId },
            include: {
                product: {
                    select: {
                        id: true,
                        sku: true,
                        name: true,
                        unit: true,
                        status: true,
                        category: { select: { id: true, name: true } },
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
        });
    }
}
export const supplierService = new SupplierService();
