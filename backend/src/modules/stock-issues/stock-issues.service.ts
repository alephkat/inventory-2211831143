import { IssueStatus, Prisma, TransactionType } from '@prisma/client';
import { prisma } from '../../shared/config/database';
import { ApiError } from '../../shared/errors/ApiError';
import { createAuditLog } from '../../shared/utils/audit';
import { documentNumber } from '../../shared/utils/document-number';
import { notificationService } from '../notifications/notifications.service';
import {
  applyStockMovements,
  assertLinesPresent,
  assertNoDuplicateLines,
  assertPositiveQuantity,
  assertRejectionReason,
  findLowStockAlerts,
  isFullyIssued,
  priceLines,
  runTransition,
  WORKFLOW_RESOURCE,
} from '../../shared/workflow';

/**
 * Stock issues: the outbound half of the inventory ledger.
 *
 * Approval and issuance are deliberately separate. Approving records that the
 * request is legitimate; issuing is what removes the goods. Keeping them apart
 * is what allows a request to be approved, then issued in two deliveries
 * (PARTIALLY_ISSUED) without re-approval, and what allows an approved request
 * to be cancelled while the stock is still in the warehouse.
 *
 *   PENDING -> APPROVED -> ISSUED
 *                    \-> PARTIALLY_ISSUED -> ISSUED
 */

const ISSUE_INCLUDE = {
  warehouse: { select: { id: true, name: true, code: true } },
  customer: { select: { id: true, name: true, code: true } },
  items: { include: { product: { select: { id: true, sku: true, name: true, unit: true } } } },
  requester: { select: { id: true, fullName: true } },
  issuedBy: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true } },
  overrideBy: { select: { id: true, fullName: true } },
} satisfies Prisma.StockIssueInclude;

export interface IssueLineInput {
  productId: string;
  requestedQuantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxPercent?: number;
  batchNumber?: string | null;
  expiryDate?: Date | null;
  notes?: string | null;
}

export class StockIssueService {
  async list(params: {
    page: number;
    limit: number;
    status?: string;
    warehouseId?: string;
    customerId?: string;
    requesterId?: string;
  }) {
    const { page, limit, status, warehouseId, customerId, requesterId } = params;
    const where: Prisma.StockIssueWhereInput = {};
    if (status) where.status = status as IssueStatus;
    if (warehouseId) where.warehouseId = warehouseId;
    if (customerId) where.customerId = customerId;
    if (requesterId) where.requesterId = requesterId;

    const [items, total] = await Promise.all([
      prisma.stockIssue.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: ISSUE_INCLUDE,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.stockIssue.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async get(id: string) {
    const issue = await prisma.stockIssue.findUnique({ where: { id }, include: ISSUE_INCLUDE });
    if (!issue) throw ApiError.notFound('Stock issue not found');
    return issue;
  }

  async create(
    data: {
      warehouseId: string;
      customerId?: string;
      department?: string;
      notes?: string;
      items: IssueLineInput[];
    },
    userId: string,
  ) {
    assertLinesPresent(data.items, 'Issue line item');
    assertNoDuplicateLines(data.items, (line) => line.productId, 'issue line for product');

    if (!data.customerId && !data.department?.trim()) {
      throw ApiError.badRequest('An issue must be attributed to a customer or a department');
    }

    for (const line of data.items) {
      assertPositiveQuantity(line.requestedQuantity, 'Requested quantity');
    }

    const warehouse = await prisma.warehouse.findUnique({
      where: { id: data.warehouseId },
      select: { id: true, isActive: true },
    });
    if (!warehouse) throw ApiError.badRequest('Invalid warehouse');
    if (!warehouse.isActive) throw ApiError.badRequest('Cannot issue from an inactive warehouse');

    const productIds = [...new Set(data.items.map((line) => line.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true },
    });
    if (products.length !== productIds.length) {
      throw ApiError.badRequest('One or more issue lines reference an unknown product');
    }

    const { priced, totals } = priceLines(
      data.items.map((line) => ({
        quantity: line.requestedQuantity,
        unitPrice: line.unitPrice,
        discountPercent: line.discountPercent,
        taxPercent: line.taxPercent,
      })),
    );

    const issueNumber = documentNumber('ISS');
    const issue = await prisma.stockIssue.create({
      data: {
        issueNumber,
        warehouseId: data.warehouseId,
        customerId: data.customerId ?? null,
        department: data.department ?? null,
        status: IssueStatus.PENDING,
        notes: data.notes ?? null,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        discountAmount: totals.discountAmount,
        totalAmount: totals.total,
        requesterId: userId,
        items: {
          create: data.items.map((line, index) => ({
            productId: line.productId,
            requestedQuantity: line.requestedQuantity,
            unitPrice: priced[index].unitPrice,
            discountPercent: priced[index].discountPercent,
            discountAmount: priced[index].discountAmount,
            taxPercent: priced[index].taxPercent,
            taxAmount: priced[index].taxAmount,
            totalPrice: priced[index].total,
            batchNumber: line.batchNumber ?? null,
            expiryDate: line.expiryDate ?? null,
            notes: line.notes ?? null,
          })),
        },
      },
    });

    await createAuditLog({
      userId,
      action: 'CREATE',
      resourceType: WORKFLOW_RESOURCE.issue,
      resourceId: issue.id,
      newValues: { status: IssueStatus.PENDING, issueNumber, lineCount: data.items.length },
    });

    return this.get(issue.id);
  }

  async approve(id: string, userId: string) {
    const issue = await this.get(id);

    await runTransition<IssueStatus>({
      workflow: 'issue',
      model: 'stockIssue',
      entityId: id,
      from: issue.status,
      to: IssueStatus.APPROVED,
      verb: 'approve',
      actorId: userId,
      reference: issue.issueNumber,
      patch: { approvedById: userId, approvedAt: new Date() },
    });

    return this.get(id);
  }

  /**
   * Issue stock out. `input` may carry a per-line quantity; when omitted the
   * full outstanding amount of each line is issued, which is the common case
   * for a complete pick.
   */
  async issue(
    id: string,
    userId: string,
    input: { items?: Array<{ issueItemId: string; issuedQuantity: number }> } = {},
  ) {
    const issue = await this.get(id);
    const lines = this.resolveIssueLines(issue, input.items, userId);

    // Totals are recomputed against the post-issue quantities so a second
    // partial issue that completes the request lands on ISSUED, not
    // PARTIALLY_ISSUED.
    const remaining = issue.items.map((item) => {
      const issued = lines.find((line) => line.issueItemId === item.id)?.issuedQuantity ?? 0;
      return {
        requestedQuantity: item.requestedQuantity,
        issuedQuantity: item.issuedQuantity + issued,
      };
    });
    const target = isFullyIssued(remaining) ? IssueStatus.ISSUED : IssueStatus.PARTIALLY_ISSUED;

    await runTransition<IssueStatus>({
      workflow: 'issue',
      model: 'stockIssue',
      entityId: id,
      from: issue.status,
      to: target,
      verb: 'issue',
      actorId: userId,
      reference: issue.issueNumber,
      details: { lineCount: lines.length },
      patch: { issuedById: userId, issuedAt: new Date() },
      sideEffects: async (tx) => {
        for (const line of lines) {
          await tx.stockIssueItem.update({
            where: { id: line.issueItemId },
            data: { issuedQuantity: { increment: line.issuedQuantity } },
          });
        }

        await applyStockMovements(
          tx,
          lines.map((line) => {
            const item = issue.items.find((candidate) => candidate.id === line.issueItemId)!;
            return {
              productId: item.productId,
              warehouseId: issue.warehouseId,
              quantity: line.issuedQuantity,
              direction: 'OUT' as const,
              type: TransactionType.ISSUED,
              reason: `Stock issue ${issue.issueNumber}`,
              referenceNumber: issue.issueNumber,
              batchNumber: item.batchNumber,
              expiryDate: item.expiryDate,
              performedById: userId,
              requireExisting: true,
              productLabel: item.product?.name,
            };
          }),
        );
      },
    });

    await this.raiseLowStockAlerts(issue, lines, userId);

    return this.get(id);
  }

  /**
   * Issue beyond the requested quantity. Allowed only with a recorded reason
   * and a recorded override user, because it is the one path that lets stock
   * leave beyond what was authorised.
   */
  async override(id: string, userId: string, reason: string) {
    const issue = await this.get(id);
    const overrideReason = assertRejectionReason(reason);

    const overLines = this.resolveIssueLines(issue, undefined, userId, { allowExcess: true });
    const target = isFullyIssued(
      issue.items.map((item) => {
        const line = overLines.find((candidate) => candidate.issueItemId === item.id);
        return {
          requestedQuantity: item.requestedQuantity,
          issuedQuantity: item.issuedQuantity + (line?.issuedQuantity ?? 0),
        };
      }),
    )
      ? IssueStatus.ISSUED
      : IssueStatus.PARTIALLY_ISSUED;

    await runTransition<IssueStatus>({
      workflow: 'issue',
      model: 'stockIssue',
      entityId: id,
      from: issue.status,
      to: target,
      verb: 'override',
      actorId: userId,
      reference: issue.issueNumber,
      reason: overrideReason,
      patch: {
        issuedById: userId,
        issuedAt: new Date(),
        overrideById: userId,
        overrideAt: new Date(),
        overrideReason,
      },
      sideEffects: async (tx) => {
        for (const line of overLines) {
          await tx.stockIssueItem.update({
            where: { id: line.issueItemId },
            data: { issuedQuantity: { increment: line.issuedQuantity } },
          });
        }
        await applyStockMovements(
          tx,
          overLines.map((line) => {
            const item = issue.items.find((candidate) => candidate.id === line.issueItemId)!;
            return {
              productId: item.productId,
              warehouseId: issue.warehouseId,
              quantity: line.issuedQuantity,
              direction: 'OUT' as const,
              type: TransactionType.ISSUED,
              reason: `Stock issue ${issue.issueNumber} (override: ${overrideReason})`,
              referenceNumber: issue.issueNumber,
              performedById: userId,
              requireExisting: true,
              productLabel: item.product?.name,
            };
          }),
        );
      },
    });

    await this.raiseLowStockAlerts(issue, overLines, userId);

    return this.get(id);
  }

  async reject(id: string, userId: string, reason?: string) {
    const issue = await this.get(id);
    const rejectionReason = assertRejectionReason(reason);

    await runTransition<IssueStatus>({
      workflow: 'issue',
      model: 'stockIssue',
      entityId: id,
      from: issue.status,
      to: IssueStatus.REJECTED,
      verb: 'reject',
      actorId: userId,
      reference: issue.issueNumber,
      reason: rejectionReason,
      patch: { approvedById: userId, approvedAt: new Date(), rejectionReason },
    });

    return this.get(id);
  }

  async cancel(id: string, userId: string, reason?: string) {
    const issue = await this.get(id);

    await runTransition<IssueStatus>({
      workflow: 'issue',
      model: 'stockIssue',
      entityId: id,
      from: issue.status,
      to: IssueStatus.CANCELLED,
      verb: 'cancel',
      actorId: userId,
      reference: issue.issueNumber,
      reason: reason ?? null,
    });

    return this.get(id);
  }

  async ledger(id: string) {
    await this.get(id);
    const issue = await this.get(id);
    return prisma.inventoryTransaction.findMany({
      where: {
        type: TransactionType.ISSUED,
        referenceNumber: issue.issueNumber,
      },
      include: {
        product: { select: { sku: true, name: true, unit: true } },
        warehouse: { select: { id: true, name: true } },
        performedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Turn the caller's line detail into a concrete issue plan, defaulting to
   * each line's outstanding quantity and rejecting anything that would exceed
   * what was authorised (unless the caller is explicitly overriding).
   */
  private resolveIssueLines(
    issue: { id: string; warehouseId: string; issueNumber: string; items: Array<{ id: string; productId: string; requestedQuantity: number; issuedQuantity: number; product?: { name: string } | null }> },
    requested: Array<{ issueItemId: string; issuedQuantity: number }> | undefined,
    userId: string,
    options: { allowExcess?: boolean } = {},
  ): Array<{ issueItemId: string; issuedQuantity: number }> {
    const lines =
      requested && requested.length > 0
        ? requested
        : issue.items.map((item) => ({
            issueItemId: item.id,
            issuedQuantity: item.requestedQuantity - item.issuedQuantity,
          }));

    assertNoDuplicateLines(lines, (line) => line.issueItemId, 'issue line');

    for (const line of lines) {
      assertPositiveQuantity(line.issuedQuantity, 'Issued quantity');
      const item = issue.items.find((candidate) => candidate.id === line.issueItemId);
      if (!item) throw ApiError.badRequest(`Unknown issue line: ${line.issueItemId}`);

      const outstanding = item.requestedQuantity - item.issuedQuantity;
      if (line.issuedQuantity > outstanding && !options.allowExcess) {
        throw ApiError.conflict(
          `Issuing ${line.issuedQuantity} exceeds the ${outstanding} still outstanding for ${
            item.product?.name ?? item.productId
          }`,
        );
      }
    }
    return lines;
  }

  private async raiseLowStockAlerts(
    issue: {
      id: string;
      warehouseId: string;
      issueNumber: string;
      warehouse?: { name: string } | null;
      items: Array<{ id: string; productId: string; product?: { name: string } | null }>;
    },
    lines: ReadonlyArray<{ issueItemId: string; issuedQuantity: number }>,
    userId: string,
  ): Promise<void> {
    const movements = issue.items
      .filter((item) => lines.some((line) => line.issueItemId === item.id))
      .map((item) => {
        const line = lines.find((candidate) => candidate.issueItemId === item.id)!;
        return {
          productId: item.productId,
          warehouseId: issue.warehouseId,
          quantity: line.issuedQuantity,
          direction: 'OUT' as const,
          reason: `Stock issue ${issue.issueNumber}`,
          performedById: userId,
          productLabel: item.product?.name,
        };
      });

    try {
      const alerts = await prisma.$transaction((tx) => findLowStockAlerts(tx, movements));
      for (const alert of alerts) {
        await notificationService.dispatch(userId, {
          title: 'Low Stock Alert',
          body: `Stock in ${issue.warehouse?.name ?? issue.warehouseId} fell to ${alert.currentQuantity} after issue ${issue.issueNumber}`,
          type: 'LOW_STOCK',
          priority: 'HIGH',
          data: { ...alert, issueId: issue.id },
        });
      }
    } catch {
      // Low-stock alerts are advisory; the issue has already been applied.
    }
  }
}

export const stockIssueService = new StockIssueService();
