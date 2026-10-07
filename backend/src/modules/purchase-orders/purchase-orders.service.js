import { Prisma, OrderStatus, SupplierStatus, TransactionType, ReceiptStatus } from '@prisma/client';
import { prisma } from '../../shared/config/database.js';
import { ApiError } from '../../shared/errors/ApiError.js';
import { createAuditLog } from '../../shared/utils/audit.js';
import { documentNumber } from '../../shared/utils/document-number.js';
import {
 assertLinesPresent,
 assertNoDuplicateLines,
 assertPositiveQuantity,
 assertRejectionReason,
 isFullyReceived,
 isTerminal,
 priceLines,
 remainingPurchaseQuantity,
 runTransition,
 applyStockMovements,
 purchaseOrderWorkflow,
 WORKFLOW_RESOURCE,
} from '../../shared/workflow.js';

const PO_INCLUDE = {
 supplier},
 warehouse},
 items},
 receiptItems},
 },
 },
 createdBy},
 approvedBy},
} satisfies Prisma.PurchaseOrderInclude;

export class PurchaseOrderService {
 async list(params) {
 const { page, limit, status, supplierId, warehouseId } = params;
 const where.PurchaseOrderWhereInput = {};
 if (status) where.status = status ;
 if (supplierId) where.supplierId = supplierId;
 if (warehouseId) where.warehouseId = warehouseId;

 const [items, total] = await Promise.all([
 prisma.purchaseOrder.findMany({
 where,
 skip: (page - 1) * limit,
 take: limit,
 include_INCLUDE,
 orderBy,
 }),
 prisma.purchaseOrder.count({ where }),
 ]);
 return { items, total, page, limit };
 }

 async get(id) {
 const po = await prisma.purchaseOrder.findUnique({
 where,
 include_INCLUDE,
 });
 if (!po) throw ApiError.notFound('Purchase order not found');
 return po;
 }

 async create(
 data,
 userId) {
 assertLinesPresent(data.items, 'Purchase order line');
 assertNoDuplicateLines(data.items, (line) => line.productId, 'purchase order line for product');
 for (const line of data.items) {
 assertPositiveQuantity(line.quantity, 'Order quantity');
 }

 const [supplier, warehouse] = await Promise.all([
 prisma.supplier.findUnique({ where, select}),
 prisma.warehouse.findUnique({ where, select}),
 ]);
 if (!supplier) throw ApiError.badRequest('Invalid supplier');
 if (supplier.status !== SupplierStatus.ACTIVE) {
 throw ApiError.badRequest(`Cannot raise a purchase order against a ${supplier.status.toLowerCase()} supplier`);
 }
 if (!warehouse) throw ApiError.badRequest('Invalid warehouse');
 if (!warehouse.isActive) throw ApiError.badRequest('Warehouse is inactive');

 const productIds = [...new Set(data.items.map((line) => line.productId))];
 const products = await prisma.product.findMany({
 where},
 select,
 });
 if (products.length !== productIds.length) {
 throw ApiError.badRequest('One or more lines reference an unknown product');
 }

 const priced = priceLines(
 data.items.map((line) => ({
 quantity: line.quantity,
 unitPrice: line.unitPrice,
 discountPercent: line.discountPercent,
 taxPercent: line.taxPercent,
 })));

 const orderNumber = documentNumber('PO');

 const po = await prisma.purchaseOrder.create({
 data)),
 },
 },
 });

 await createAuditLog({
 userId,
 action: 'CREATE',
 resourceType_RESOURCE.purchaseOrder,
 resourceId: po.id,
 newValues,
 });

 return this.get(po.id);
 }

 async recalcAndUpdateTotals(tx.TransactionClient, poId) {
 const items = await tx.purchaseOrderItem.findMany({
 where,
 select,
 });
 const totals = items.reduce<{ subtotal; discountAmount; taxAmount; total }>(
 (acc, line) => ({
 subtotal: acc.subtotal + Number(line.quantity) * Number(line.unitPrice),
 discountAmount: acc.discountAmount + Number(line.discountAmount),
 taxAmount: acc.taxAmount + Number(line.taxAmount),
 total: acc.total + Number(line.totalPrice),
 }),
 { subtotal: 0, discountAmount: 0, taxAmount: 0, total: 0 });
 totals.total = Math.round((totals.subtotal - totals.discountAmount + totals.taxAmount + Number.EPSILON) * 100) / 100;
 await tx.purchaseOrder.update({
 where,
 data,
 });
 }

 async addItem(poId, item, userId) {
 const po = await this.get(poId);
 if (po.status !== OrderStatus.DRAFT) {
 throw ApiError.conflict('Cannot modify a submitted purchase order; submit it first to change lines');
 }
 assertPositiveQuantity(item.quantity, 'Order quantity');
 assertNoDuplicateLines([item], (line) => line.productId, 'purchase order line for product');

 const product = await prisma.product.findUnique({ where, select});
 if (!product) throw ApiError.badRequest('Invalid product');

 const priced = priceLine({
 quantity: item.quantity,
 unitPrice: item.unitPrice,
 discountPercent: item.discountPercent ?? 0,
 taxPercent: item.taxPercent ?? 0,
 });

 await prisma.$transaction(async (tx) => {
 await tx.purchaseOrderItem.create({
 data,
 });
 await this.recalcAndUpdateTotals(tx, poId);
 });

 await createAuditLog({
 userId,
 action: 'UPDATE',
 resourceType_RESOURCE.purchaseOrder,
 resourceId: poId,
 newValues,
 });

 return this.get(poId);
 }

 async removeItem(poId, itemId, userId) {
 const po = await this.get(poId);
 if (po.status !== OrderStatus.DRAFT) {
 throw ApiError.conflict('Cannot modify a submitted purchase order; submit it first to change lines');
 }

 const item = await prisma.purchaseOrderItem.findUnique({ where});
 if (!item || item.purchaseOrderId !== poId) {
 throw ApiError.notFound('Purchase order item not found');
 }

 await prisma.$transaction(async (tx) => {
 await tx.purchaseOrderItem.delete({ where});
 await this.recalcAndUpdateTotals(tx, poId);
 });

 await createAuditLog({
 userId,
 action: 'UPDATE',
 resourceType_RESOURCE.purchaseOrder,
 resourceId: poId,
 newValues,
 });

 return this.get(poId);
 }

 async submit(id, userId) {
 const po = await this.get(id);
 if (po.items.length === 0) throw ApiError.badRequest('Cannot submit a purchase order with no lines');

 await runTransition({
 workflow: 'purchaseOrder',
 model: 'purchaseOrder',
 entityId: id,
 from: po.status,
 to.PENDING,
 verb: 'submit',
 actorId: userId,
 reference: po.orderNumber,
 });

 return this.get(id);
 }

 async approve(id, userId) {
 const po = await this.get(id);

 await runTransition({
 workflow: 'purchaseOrder',
 model: 'purchaseOrder',
 entityId: id,
 from: po.status,
 to.APPROVED,
 verb: 'approve',
 actorId: userId,
 reference: po.orderNumber,
 patch,
 });

 return this.get(id);
 }

 async reject(id, userId, reason?) {
 const po = await this.get(id);
 const rejectionReason = assertRejectionReason(reason);

 await runTransition({
 workflow: 'purchaseOrder',
 model: 'purchaseOrder',
 entityId: id,
 from: po.status,
 to.REJECTED,
 verb: 'reject',
 actorId: userId,
 reference: po.orderNumber,
 reason: rejectionReason,
 patch,
 });

 return this.get(id);
 }

 async cancel(id, userId, reason?) {
 const po = await this.get(id);
 if (isTerminal(purchaseOrderWorkflow, po.status)) {
 throw ApiError.conflict(`A ${po.status.toLowerCase()} purchase order cannot be cancelled`);
 }

 await runTransition({
 workflow: 'purchaseOrder',
 model: 'purchaseOrder',
 entityId: id,
 from: po.status,
 to.CANCELLED,
 verb: 'cancel',
 actorId: userId,
 reference: po.orderNumber,
 reason: reason ?? null,
 });

 return this.get(id);
 }

 async receive(id, userId, input) {
 const po = await this.get(id);
 if (po.status !== OrderStatus.APPROVED && po.status !== OrderStatus.PARTIALLY_RECEIVED) {
 throw ApiError.conflict(`Cannot receive a ${po.status.toLowerCase()} purchase order`);
 }
 if (!input.items || input.items.length === 0) {
 throw ApiError.badRequest('At least one receipt line is required');
 }
 assertNoDuplicateLines(input.items, (line) => line.purchaseOrderItemId, 'receipt line');

 const lineMap = new Map(po.items.map((item) => [item.id, item]));
 for (const line of input.items) {
 const item = lineMap.get(line.purchaseOrderItemId);
 if (!item) throw ApiError.badRequest(`Unknown purchase order line: ${line.purchaseOrderItemId}`);
 assertPositiveQuantity(line.receivedQuantity, 'Received quantity');
 const remaining = remainingPurchaseQuantity(item.quantity, item.receivedQuantity);
 if (line.receivedQuantity > remaining) {
 throw ApiError.badRequest(
 `Received quantity for ${item.product?.name ?? item.productId} (${line.receivedQuantity}) exceeds remaining quantity (${remaining})`);
 }
 }

 // Project the post-receipt quantities before opening the transaction, so
 // the target status can be passed to runTransition and validated against
 // the workflow table up front. Deriving it inside the transaction would
 // mean writing a status the state machine never approved.
 const receivedByItemId = new Map(
 input.items.map((line) => [line.purchaseOrderItemId, line.receivedQuantity]));
 const projected = po.items.map((item) => ({
 quantity: item.quantity,
 receivedQuantity: item.receivedQuantity + (receivedByItemId.get(item.id) ?? 0),
 }));
 const targetStatus = isFullyReceived(projected)
 ? OrderStatus.COMPLETED
 .PARTIALLY_RECEIVED;

 await runTransition({
 workflow: 'purchaseOrder',
 model: 'purchaseOrder',
 entityId: id,
 from: po.status,
 to: targetStatus,
 verb: 'receive',
 actorId: userId,
 reference: po.orderNumber,
 details,
 patch,
 sideEffects: async (tx) => {
 const updatedItems| null }[] = [];
 const lineByItemId = new Map(input.items.map((l) => [l.purchaseOrderItemId, l]));

 for (const line of input.items) {
 const item = await tx.purchaseOrderItem.findUnique({
 where,
 include} },
 });
 if (!item) throw ApiError.badRequest(`Unknown purchase order line: ${line.purchaseOrderItemId}`);

 const newReceivedQty = item.receivedQuantity + line.receivedQuantity;
 await tx.purchaseOrderItem.update({
 where,
 data,
 });

 updatedItems.push({
 id: item.id,
 quantity: item.quantity,
 receivedQuantity: newReceivedQty,
 productId: item.productId,
 unitPrice(item.unitPrice),
 discountPercent(item.discountPercent),
 taxPercent(item.taxPercent),
 product: item.product,
 });
 }

 await applyStockMovements(
 tx,
 updatedItems.map((item) => {
 const line = lineByItemId.get(item.id)!;
 return {
 productId: item.productId,
 warehouseId: po.warehouseId,
 quantity: line.receivedQuantity,
 direction: 'IN' as const,
 type.RECEIVED,
 reason: `Purchase order ${po.orderNumber}`,
 referenceNumber: po.orderNumber,
 batchNumber: line.batchNumber ?? null,
 expiryDate: line.expiryDate ?? null,
 performedById: userId,
 productLabel: item.product?.name,
 };
 }));

 const receiptLines = input.items.map((line) => {
 const item = updatedItems.find((i) => i.id === line.purchaseOrderItemId)!;
 const priced = priceLine({
 quantity: line.receivedQuantity,
 unitPrice: item.unitPrice,
 discountPercent: item.discountPercent ?? 0,
 taxPercent: item.taxPercent ?? 0,
 });
 return {
 productId: item.productId,
 purchaseOrderItemId: item.id,
 orderedQuantity: item.quantity,
 receivedQuantity: line.receivedQuantity,
 unitPrice: priced.unitPrice,
 discountPercent: priced.discountPercent,
 discountAmount: priced.discountAmount,
 taxPercent: priced.taxPercent,
 taxAmount: priced.taxAmount,
 totalPrice: priced.total,
 batchNumber: line.batchNumber ?? null,
 expiryDate: line.expiryDate ?? null,
 manufacturingDate: line.manufacturingDate ?? null,
 };
 });

 const receiptPriced = priceLines(receiptLines.map((l) => ({
 quantity: l.receivedQuantity,
 unitPrice: l.unitPrice,
 discountPercent: l.discountPercent,
 taxPercent: l.taxPercent,
 })));

 const receipt = await tx.stockReceipt.create({
 data)),
 },
 },
 });

 await createAuditLog({
 userId,
 action: 'RECEIVE',
 resourceType_RESOURCE.purchaseOrder,
 resourceId: po.id,
 newValues,
 });
 },
 });

 return this.get(id);
 }
}

function priceLine(input) {
 const discountPercent = input.discountPercent ?? 0;
 const taxPercent = input.taxPercent ?? 0;
 const subtotal = Math.round((input.quantity * input.unitPrice + Number.EPSILON) * 100) / 100;
 const discountAmount = Math.round(((subtotal * discountPercent) / 100 + Number.EPSILON) * 100) / 100;
 const taxable = Math.round((subtotal - discountAmount + Number.EPSILON) * 100) / 100;
 const taxAmount = Math.round(((taxable * taxPercent) / 100 + Number.EPSILON) * 100) / 100;
 const total = Math.round((taxable + taxAmount + Number.EPSILON) * 100) / 100;
 return {
 quantity: input.quantity,
 unitPrice: input.unitPrice,
 discountPercent,
 discountAmount,
 taxPercent,
 taxAmount,
 subtotal,
 total,
 };
}

export const purchaseOrderService = new PurchaseOrderService();