import { Prisma, TransferStatus } from '@prisma/client';
import { prisma } from '../../shared/config/database';
import { ApiError } from '../../shared/errors/ApiError';
import { createAuditLog } from '../../shared/utils/audit';
import { documentNumber } from '../../shared/utils/document-number';
import {
  assertDistinctWarehouses,
  assertLinesPresent,
  assertNoDuplicateLines,
  assertPositiveQuantity,
  assertRejectionReason,
  assertSufficientStock,
  applyStockMovements,
  isTerminal,
  runTransition,
  transferWorkflow,
  WORKFLOW_RESOURCE,
} from '../../shared/workflow';

/**
 * Inter-warehouse transfers.
 *
 * Stock leaves the source only when the transfer is dispatched and only
 * arrives at the destination once the receiving warehouse confirms what it
 * actually got. That split is the point of the five-stage flow: an
 * in-transit shipment is visible as stock-out at the source but not yet
 * stock-in at the destination, so the two warehouses' ledgers disagree
 * honestly instead of pretending the goods teleported.
 *
 *   REQUESTED -> APPROVED -> DISPATCHED -> IN_TRANSIT -> RECEIVED -> CONFIRMED
 */

const TRANSFER_INCLUDE = {
  fromWarehouse: { select: { id: true, name: true, code: true } },
  toWarehouse: { select: { id: true, name: true, code: true } },
  items: { include: { product: { select: { id: true, sku: true, name: true, unit: true } } } },
  requestedBy: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true } },
  dispatchedBy: { select: { id: true, fullName: true } },
  receivedBy: { select: { id: true, fullName: true } },
  confirmedBy: { select: { id: true, fullName: true } },
  history: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.StockTransferInclude;

export interface TransferLineInput {
  productId: string;
  quantity: number;
  batchNumber?: string | null;
  expiryDate?: Date | null;
}

export class StockTransferService {
  async list(params: {
    page: number;
    limit: number;
    status?: string;
    fromWarehouseId?: string;
    toWarehouseId?: string;
  }) {
    const { page, limit, status, fromWarehouseId, toWarehouseId } = params;
    const where: Prisma.StockTransferWhereInput = {};
    if (status) where.status = status as TransferStatus;
    if (fromWarehouseId) where.fromWarehouseId = fromWarehouseId;
    if (toWarehouseId) where.toWarehouseId = toWarehouseId;

    const [items, total] = await Promise.all([
      prisma.stockTransfer.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: TRANSFER_INCLUDE,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.stockTransfer.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async get(id: string) {
    const transfer = await prisma.stockTransfer.findUnique({
      where: { id },
      include: TRANSFER_INCLUDE,
    });
    if (!transfer) throw ApiError.notFound('Stock transfer not found');
    return transfer;
  }

  async create(
    data: {
      fromWarehouseId: string;
      toWarehouseId: string;
      notes?: string;
      items: TransferLineInput[];
    },
    userId: string,
  ) {
    assertLinesPresent(data.items, 'Transfer line');
    assertDistinctWarehouses(data.fromWarehouseId, data.toWarehouseId);
    assertNoDuplicateLines(data.items, (line) => line.productId, 'transfer line for product');
    for (const line of data.items) {
      assertPositiveQuantity(line.quantity, 'Transfer quantity');
    }

    const [from, to] = await Promise.all([
      prisma.warehouse.findUnique({ where: { id: data.fromWarehouseId }, select: { id: true, name: true, isActive: true } }),
      prisma.warehouse.findUnique({ where: { id: data.toWarehouseId }, select: { id: true, name: true, isActive: true } }),
    ]);
    if (!from) throw ApiError.badRequest('Invalid source warehouse');
    if (!to) throw ApiError.badRequest('Invalid destination warehouse');
    if (!from.isActive || !to.isActive) {
      throw ApiError.badRequest('Transfers require two active warehouses');
    }

    const productIds = [...new Set(data.items.map((line) => line.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true },
    });
    if (products.length !== productIds.length) {
      throw ApiError.badRequest('One or more transfer lines reference an unknown product');
    }

    const transfer = await prisma.stockTransfer.create({
      data: {
        referenceNumber: documentNumber('TRF'),
        fromWarehouseId: data.fromWarehouseId,
        toWarehouseId: data.toWarehouseId,
        status: TransferStatus.REQUESTED,
        notes: data.notes ?? null,
        requestedById: userId,
        requestedAt: new Date(),
        items: {
          create: data.items.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            batchNumber: line.batchNumber ?? null,
            expiryDate: line.expiryDate ?? null,
          })),
        },
        history: {
          create: { toStatus: TransferStatus.REQUESTED, changedById: userId, notes: data.notes ?? null },
        },
      },
    });

    await createAuditLog({
      userId,
      action: 'TRANSFER',
      resourceType: WORKFLOW_RESOURCE.transfer,
      resourceId: transfer.id,
      newValues: {
        status: TransferStatus.REQUESTED,
        referenceNumber: transfer.referenceNumber,
        lineCount: data.items.length,
      },
    });

    return this.get(transfer.id);
  }

  /**
   * Approving reserves nothing; it only records the decision. Availability is
   * re-checked at dispatch, because other receipts and issues can change the
   * source balance between approval and dispatch.
   */
  async approve(id: string, userId: string) {
    const transfer = await this.get(id);
    await this.assertSourceAvailability(transfer);

    await runTransition<TransferStatus>({
      workflow: 'transfer',
      model: 'stockTransfer',
      entityId: id,
      from: transfer.status,
      to: TransferStatus.APPROVED,
      verb: 'approve',
      actorId: userId,
      reference: transfer.referenceNumber,
      patch: { approvedById: userId, approvedAt: new Date() },
      onTransitioned: (tx) => this.recordHistory(tx, id, transfer.status, TransferStatus.APPROVED, userId),
    });

    return this.get(id);
  }

  /**
   * Dispatch is the point at which stock actually leaves the source. The
   * decrement happens here, not at approval, so an approved-but-never-dispatched
   * transfer never shows as a phantom loss.
   */
  async dispatch(id: string, userId: string) {
    const transfer = await this.get(id);
    await this.assertSourceAvailability(transfer);

    await runTransition<TransferStatus>({
      workflow: 'transfer',
      model: 'stockTransfer',
      entityId: id,
      from: transfer.status,
      to: TransferStatus.DISPATCHED,
      verb: 'dispatch',
      actorId: userId,
      reference: transfer.referenceNumber,
      details: { fromWarehouseId: transfer.fromWarehouseId },
      patch: { dispatchedById: userId, dispatchedAt: new Date() },
      sideEffects: async (tx) => {
        await applyStockMovements(
          tx,
          transfer.items.map((item) => ({
            productId: item.productId,
            warehouseId: transfer.fromWarehouseId,
            quantity: item.quantity,
            direction: 'OUT' as const,
            type: undefined,
            reason: `Transfer ${transfer.referenceNumber ?? id} dispatched`,
            referenceNumber: transfer.referenceNumber,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
            performedById: userId,
            relatedTransferId: transfer.id,
            productLabel: item.product?.name,
          })),
        );
      },
      onTransitioned: (tx) => this.recordHistory(tx, id, transfer.status, TransferStatus.DISPATCHED, userId),
    });

    return this.get(id);
  }

  async markInTransit(id: string, userId: string) {
    const transfer = await this.get(id);
    await runTransition<TransferStatus>({
      workflow: 'transfer',
      model: 'stockTransfer',
      entityId: id,
      from: transfer.status,
      to: TransferStatus.IN_TRANSIT,
      verb: 'mark in transit',
      actorId: userId,
      reference: transfer.referenceNumber,
      onTransitioned: (tx) => this.recordHistory(tx, id, transfer.status, TransferStatus.IN_TRANSIT, userId),
    });
    return this.get(id);
  }

  /**
   * The destination records what physically arrived. Quantities may be less
   * than dispatched (damage, loss in transit); the shortfall stays visible on
   * the line until confirmation, which is where the books are corrected.
   */
  async receive(
    id: string,
    userId: string,
    input: { items?: Array<{ transferItemId: string; receivedQuantity: number }> },
  ) {
    const transfer = await this.get(id);

    // No detail supplied: assume the full shipment landed.
    const lines: Array<{ transferItemId: string; receivedQuantity: number }> =
      input.items && input.items.length > 0
        ? input.items
        : transfer.items.map((item) => ({
            transferItemId: item.id,
            receivedQuantity: item.quantity,
          }));

    for (const line of lines) {
      assertPositiveQuantity(line.receivedQuantity, 'Received quantity');
    }
    assertNoDuplicateLines(lines, (line) => line.transferItemId, 'receipt line');

    for (const line of lines) {
      const item = transfer.items.find((candidate) => candidate.id === line.transferItemId);
      if (!item) throw ApiError.badRequest(`Unknown transfer line: ${line.transferItemId}`);
      if (line.receivedQuantity > item.quantity) {
        throw ApiError.badRequest(
          `Received quantity for ${item.product?.name ?? item.productId} cannot exceed the dispatched quantity of ${item.quantity}`,
        );
      }
    }

    await runTransition<TransferStatus>({
      workflow: 'transfer',
      model: 'stockTransfer',
      entityId: id,
      from: transfer.status,
      to: TransferStatus.RECEIVED,
      verb: 'receive',
      actorId: userId,
      reference: transfer.referenceNumber,
      details: { lineCount: lines.length },
      patch: { receivedById: userId, receivedAt: new Date() },
      sideEffects: async (tx) => {
        for (const line of lines) {
          await tx.stockTransferItem.update({
            where: { id: line.transferItemId },
            data: { receivedQuantity: line.receivedQuantity },
          });
        }
      },
      onTransitioned: (tx) => this.recordHistory(tx, id, transfer.status, TransferStatus.RECEIVED, userId),
    });

    return this.get(id);
  }

  /**
   * Confirmation books the goods into the destination warehouse and writes off
   * any quantity lost in transit, so the total stock across the network stays
   * consistent with what was physically handled.
   */
  async confirm(id: string, userId: string) {
    const transfer = await this.get(id);

    for (const item of transfer.items) {
      if (item.receivedQuantity <= 0) {
        throw ApiError.conflict(
          `Transfer line ${item.product?.name ?? item.productId} has no received quantity; receive the transfer before confirming`,
        );
      }
    }

    await runTransition<TransferStatus>({
      workflow: 'transfer',
      model: 'stockTransfer',
      entityId: id,
      from: transfer.status,
      to: TransferStatus.CONFIRMED,
      verb: 'confirm',
      actorId: userId,
      reference: transfer.referenceNumber,
      details: { toWarehouseId: transfer.toWarehouseId },
      patch: { confirmedById: userId, confirmedAt: new Date() },
      sideEffects: async (tx) => {
        await applyStockMovements(
          tx,
          transfer.items.map((item) => ({
            productId: item.productId,
            warehouseId: transfer.toWarehouseId,
            quantity: item.receivedQuantity,
            direction: 'IN' as const,
            reason: `Transfer ${transfer.referenceNumber ?? id} received`,
            referenceNumber: transfer.referenceNumber,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
            performedById: userId,
            relatedTransferId: transfer.id,
            productLabel: item.product?.name,
          })),
        );
      },
      onTransitioned: (tx) => this.recordHistory(tx, id, transfer.status, TransferStatus.CONFIRMED, userId),
    });

    return this.get(id);
  }

  async reject(id: string, userId: string, reason?: string) {
    const transfer = await this.get(id);
    const rejectionReason = assertRejectionReason(reason);

    await runTransition<TransferStatus>({
      workflow: 'transfer',
      model: 'stockTransfer',
      entityId: id,
      from: transfer.status,
      to: TransferStatus.REJECTED,
      verb: 'reject',
      actorId: userId,
      reference: transfer.referenceNumber,
      reason: rejectionReason,
      patch: { approvedById: userId, approvedAt: new Date(), notes: rejectionReason },
      onTransitioned: (tx) => this.recordHistory(tx, id, transfer.status, TransferStatus.REJECTED, userId, rejectionReason),
    });

    return this.get(id);
  }

  /**
   * Cancelling after dispatch is only allowed up to the point the goods
   * physically arrive: once the destination has confirmed, the stock exists in
   * two places on the books and only a return can reconcile it.
   */
  async cancel(id: string, userId: string, reason?: string) {
    const transfer = await this.get(id);
    if (isTerminal(transferWorkflow, transfer.status)) {
      throw ApiError.conflict(`A ${transfer.status.toLowerCase()} transfer cannot be cancelled`);
    }

    await runTransition<TransferStatus>({
      workflow: 'transfer',
      model: 'stockTransfer',
      entityId: id,
      from: transfer.status,
      to: TransferStatus.CANCELLED,
      verb: 'cancel',
      actorId: userId,
      reference: transfer.referenceNumber,
      reason: reason ?? null,
      onTransitioned: (tx) => this.recordHistory(tx, id, transfer.status, TransferStatus.CANCELLED, userId, reason ?? null),
    });

    return this.get(id);
  }

  /** Ledger + history for the whole transfer, for reconciliation screens. */
  async ledger(id: string) {
    await this.get(id);
    return prisma.inventoryTransaction.findMany({
      where: { relatedTransferId: id },
      include: {
        product: { select: { sku: true, name: true, unit: true } },
        warehouse: { select: { id: true, name: true } },
        performedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async assertSourceAvailability(transfer: { id: string; fromWarehouseId: string; items: Array<{ productId: string; quantity: number; product?: { name: string } | null }> }) {
    const levels = await prisma.inventory.findMany({
      where: {
        warehouseId: transfer.fromWarehouseId,
        productId: { in: transfer.items.map((item) => item.productId) },
      },
    });
    const byProduct = new Map(levels.map((level) => [level.productId, level]));

    for (const item of transfer.items) {
      const level = byProduct.get(item.productId);
      const available = level?.availableQuantity ?? 0;
      if (available < item.quantity) {
        throw ApiError.conflict(
          `Insufficient stock to transfer ${item.product?.name ?? item.productId}: requested ${item.quantity}, available ${available}`,
        );
      }
      // Re-exported through the guard so the message shape stays consistent.
      assertSufficientStock(available, item.quantity, `Available stock for ${item.product?.name ?? item.productId}`);
    }
  }

  private async recordHistory(
    tx: Prisma.TransactionClient,
    transferId: string,
    fromStatus: TransferStatus,
    toStatus: TransferStatus,
    userId: string,
    notes?: string | null,
  ) {
    await tx.transferHistory.create({
      data: {
        transferId,
        fromStatus,
        toStatus,
        changedById: userId,
        notes: notes ?? null,
      },
    });
  }
}

export const stockTransferService = new StockTransferService();
