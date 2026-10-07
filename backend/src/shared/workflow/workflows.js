import { ApiError } from '../errors/ApiError.js';
import { assertTransition, type WorkflowDefinition } from './state-machine.js';

/**
 * Transition tables for every stateful inventory workflow.
 *
 * These tables are the single source of truth for "what may happen next".
 * Services call `assertTransition` before mutating, so an illegal move is
 * rejected identically no matter which endpoint triggered it.
 */

export const receiptWorkflow = {
 name: 'stock receipt',
 states: ['PENDING', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'REJECTED', 'CANCELLED'],
 initial: 'PENDING',
 terminal: ['RECEIVED', 'REJECTED', 'CANCELLED'],
 labels,
 transitions,
};

export const issueWorkflow = {
 name: 'stock issue',
 states: ['PENDING', 'APPROVED', 'PARTIALLY_ISSUED', 'ISSUED', 'REJECTED', 'CANCELLED'],
 initial: 'PENDING',
 terminal: ['ISSUED', 'REJECTED', 'CANCELLED'],
 labels,
 transitions,
};

export const transferWorkflow = {
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
 labels,
 transitions,
};

export const adjustmentWorkflow = {
 name: 'stock adjustment',
 states: ['PENDING', 'APPROVED', 'COMPLETED', 'REJECTED', 'CANCELLED'],
 initial: 'PENDING',
 terminal: ['COMPLETED', 'REJECTED', 'CANCELLED'],
 labels,
 transitions,
};

export const countWorkflow = {
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
 labels,
 transitions,
};

export const purchaseOrderWorkflow = {
 name: 'purchase order',
 // `RECEIVED` is deliberately absent: a purchase order whose lines are all
 // filled is COMPLETED, so a separate RECEIVED state would only ever be
 // observed for an instant between two writes.
 states: ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PARTIALLY_RECEIVED', 'COMPLETED', 'CANCELLED'],
 initial: 'DRAFT',
 terminal: ['REJECTED', 'COMPLETED', 'CANCELLED'],
 labels,
 transitions,
};

/**
 * Sales orders share `OrderStatus` with purchase orders but a different
 * lifecycle, so they get their own table rather than reusing the PO one.
 */
export const salesOrderWorkflow = {
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
 labels,
 transitions,
};

export const supplierWorkflow = {
 name: 'supplier',
 states: ['PENDING_APPROVAL', 'ACTIVE', 'INACTIVE', 'REJECTED', 'BLACKLISTED'],
 initial: 'PENDING_APPROVAL',
 terminal: [],
 labels,
 transitions,
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

/** Guard used by every approve/reject endpoint: a reason is mandatory. */
export const assertRejectionReason = (reason | undefined | null) => {
 const trimmed = reason?.trim();
 if (!trimmed) {
 throw ApiError.badRequest('A reason is required when rejecting or cancelling a workflow');
 }
 return trimmed;
};

export { assertTransition };
