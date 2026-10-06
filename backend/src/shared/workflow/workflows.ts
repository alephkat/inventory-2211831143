import type {
  CountStatus,
  IssueStatus,
  OrderStatus,
  ReceiptStatus,
  SupplierStatus,
  TransactionStatus,
  TransferStatus,
} from '@prisma/client';
import { ApiError } from '../errors/ApiError';
import { assertTransition, type WorkflowDefinition } from './state-machine';

/**
 * Transition tables for every stateful inventory workflow.
 *
 * These tables are the single source of truth for "what may happen next".
 * Services call `assertTransition` before mutating, so an illegal move is
 * rejected identically no matter which endpoint triggered it.
 */

export const receiptWorkflow: WorkflowDefinition<ReceiptStatus> = {
  name: 'stock receipt',
  states: ['PENDING', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'REJECTED', 'CANCELLED'],
  initial: 'PENDING',
  terminal: ['RECEIVED', 'REJECTED', 'CANCELLED'],
  labels: {
    PENDING: 'pending',
    APPROVED: 'approved',
    PARTIALLY_RECEIVED: 'partially received',
    RECEIVED: 'received',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled',
  },
  transitions: {
    PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
    APPROVED: ['RECEIVED', 'PARTIALLY_RECEIVED', 'CANCELLED'],
    PARTIALLY_RECEIVED: ['RECEIVED', 'CANCELLED'],
  },
};

export const issueWorkflow: WorkflowDefinition<IssueStatus> = {
  name: 'stock issue',
  states: ['PENDING', 'APPROVED', 'PARTIALLY_ISSUED', 'ISSUED', 'REJECTED', 'CANCELLED'],
  initial: 'PENDING',
  terminal: ['ISSUED', 'REJECTED', 'CANCELLED'],
  labels: {
    PENDING: 'pending',
    APPROVED: 'approved',
    PARTIALLY_ISSUED: 'partially issued',
    ISSUED: 'issued',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled',
  },
  transitions: {
    PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
    APPROVED: ['ISSUED', 'PARTIALLY_ISSUED', 'CANCELLED'],
    PARTIALLY_ISSUED: ['ISSUED', 'CANCELLED'],
  },
};

export const transferWorkflow: WorkflowDefinition<TransferStatus> = {
  name: 'stock transfer',
  states: [
    'REQUESTED',
    'APPROVED',
    'DISPATCHED',
    'IN_TRANSIT',
    'RECEIVED',
    'CONFIRMED',
    'REJECTED',
    'CANCELLED',
  ],
  initial: 'REQUESTED',
  terminal: ['CONFIRMED', 'REJECTED', 'CANCELLED'],
  labels: {
    REQUESTED: 'requested',
    APPROVED: 'approved',
    DISPATCHED: 'dispatched',
    IN_TRANSIT: 'in transit',
    RECEIVED: 'received',
    CONFIRMED: 'confirmed',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled',
  },
  transitions: {
    REQUESTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
    APPROVED: ['DISPATCHED', 'CANCELLED'],
    DISPATCHED: ['IN_TRANSIT', 'CANCELLED'],
    IN_TRANSIT: ['RECEIVED', 'CANCELLED'],
    RECEIVED: ['CONFIRMED'],
  },
};

export const adjustmentWorkflow: WorkflowDefinition<TransactionStatus> = {
  name: 'stock adjustment',
  states: ['PENDING', 'APPROVED', 'COMPLETED', 'REJECTED', 'CANCELLED'],
  initial: 'PENDING',
  terminal: ['COMPLETED', 'REJECTED', 'CANCELLED'],
  labels: {
    PENDING: 'pending',
    APPROVED: 'approved',
    COMPLETED: 'completed',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled',
  },
  transitions: {
    PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
    APPROVED: ['COMPLETED', 'CANCELLED'],
  },
};

export const countWorkflow: WorkflowDefinition<CountStatus> = {
  name: 'stock count',
  states: [
    'DRAFT',
    'IN_PROGRESS',
    'COMPLETED',
    'REVIEWED',
    'APPROVED',
    'ADJUSTED',
    'CANCELLED',
  ],
  initial: 'DRAFT',
  terminal: ['ADJUSTED', 'CANCELLED'],
  labels: {
    DRAFT: 'draft',
    IN_PROGRESS: 'in progress',
    COMPLETED: 'counted',
    REVIEWED: 'reviewed',
    APPROVED: 'approved',
    ADJUSTED: 'adjusted',
    CANCELLED: 'cancelled',
  },
  transitions: {
    DRAFT: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
    COMPLETED: ['REVIEWED', 'CANCELLED'],
    REVIEWED: ['APPROVED', 'CANCELLED'],
    APPROVED: ['ADJUSTED'],
  },
};

export const purchaseOrderWorkflow: WorkflowDefinition<OrderStatus> = {
  name: 'purchase order',
  // `RECEIVED` is deliberately absent: a purchase order whose lines are all
  // filled is COMPLETED, so a separate RECEIVED state would only ever be
  // observed for an instant between two writes.
  states: ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PARTIALLY_RECEIVED', 'COMPLETED', 'CANCELLED'],
  initial: 'DRAFT',
  terminal: ['REJECTED', 'COMPLETED', 'CANCELLED'],
  labels: {
    DRAFT: 'draft',
    PENDING: 'pending approval',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    PARTIALLY_RECEIVED: 'partially received',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  },
  transitions: {
    DRAFT: ['PENDING', 'CANCELLED'],
    PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
    APPROVED: ['PARTIALLY_RECEIVED', 'COMPLETED', 'CANCELLED'],
    PARTIALLY_RECEIVED: ['COMPLETED', 'CANCELLED'],
  },
};

/**
 * Sales orders share `OrderStatus` with purchase orders but a different
 * lifecycle, so they get their own table rather than reusing the PO one.
 */
export const salesOrderWorkflow: WorkflowDefinition<OrderStatus> = {
  name: 'sales order',
  states: [
    'DRAFT',
    'PENDING',
    'APPROVED',
    'REJECTED',
    'PARTIALLY_RECEIVED',
    'ISSUED',
    'RECEIVED',
    'COMPLETED',
    'CANCELLED',
  ],
  initial: 'DRAFT',
  terminal: ['REJECTED', 'COMPLETED', 'CANCELLED'],
  labels: {
    DRAFT: 'draft',
    PENDING: 'pending approval',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    PARTIALLY_RECEIVED: 'partially fulfilled',
    ISSUED: 'issued',
    RECEIVED: 'delivered',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  },
  transitions: {
    DRAFT: ['PENDING', 'CANCELLED'],
    PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
    APPROVED: ['ISSUED', 'PARTIALLY_RECEIVED', 'CANCELLED'],
    PARTIALLY_RECEIVED: ['ISSUED', 'COMPLETED', 'CANCELLED'],
    ISSUED: ['RECEIVED', 'COMPLETED'],
    RECEIVED: ['COMPLETED'],
  },
};

export const supplierWorkflow: WorkflowDefinition<SupplierStatus> = {
  name: 'supplier',
  states: ['PENDING_APPROVAL', 'ACTIVE', 'INACTIVE', 'REJECTED', 'BLACKLISTED'],
  initial: 'PENDING_APPROVAL',
  terminal: [],
  labels: {
    PENDING_APPROVAL: 'pending approval',
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    REJECTED: 'rejected',
    BLACKLISTED: 'blacklisted',
  },
  transitions: {
    PENDING_APPROVAL: ['ACTIVE', 'REJECTED', 'BLACKLISTED'],
    ACTIVE: ['INACTIVE', 'BLACKLISTED'],
    INACTIVE: ['ACTIVE', 'BLACKLISTED'],
    REJECTED: ['PENDING_APPROVAL', 'ACTIVE'],
    BLACKLISTED: ['PENDING_APPROVAL', 'ACTIVE'],
  },
};

export const allWorkflows = {
  receipt: receiptWorkflow,
  issue: issueWorkflow,
  transfer: transferWorkflow,
  adjustment: adjustmentWorkflow,
  count: countWorkflow,
  purchaseOrder: purchaseOrderWorkflow,
  salesOrder: salesOrderWorkflow,
  supplier: supplierWorkflow,
} as const;

export type WorkflowKey = keyof typeof allWorkflows;

/** Guard used by every approve/reject endpoint: a reason is mandatory. */
export const assertRejectionReason = (reason: string | undefined | null): string => {
  const trimmed = reason?.trim();
  if (!trimmed) {
    throw ApiError.badRequest('A reason is required when rejecting or cancelling a workflow');
  }
  return trimmed;
};

export { assertTransition };
