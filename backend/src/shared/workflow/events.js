import { allWorkflows, type WorkflowKey } from './workflows.js';

/**
 * What happens when a workflow moves: the audit action recorded and the
 * notification raised. Both maps are pure data, so the audit trail for a
 * transition is declared once and asserted by tests rather than being
 * re-derived (and drifting) inside each service.
 */

export const WORKFLOW_RESOURCE> = {
 receipt: 'stock_receipt',
 issue: 'stock_issue',
 transfer: 'stock_transfer',
 adjustment: 'stock_adjustment',
 count: 'stock_count',
 purchaseOrder: 'purchase_order',
 salesOrder: 'sales_order',
 supplier: 'supplier',
};

/**
 * Target state -> audit action. Unlisted states fall back to UPDATE, which is
 * the correct generic verb for bookkeeping moves (submit, review, cancel).
 */
const AUDIT_ACTIONS>>> = {
 receipt,
 issue,
 transfer,
 adjustment,
 count,
 purchaseOrder,
 salesOrder,
 supplier,
};

export const auditActionFor = (auditActionFor) =>
 AUDIT_ACTIONS[workflow][to] ?? 'UPDATE';

const defined = (value) => {
 const out = {};
 for (const [key, v] of Object.entries(value)) {
 if (v !== undefined) out[key] = v;
 }
 return out;
};

/**
 * Build the audit payload for a single transition. Status, the acting verb
 * and any reason are always recorded, so a reviewer can reconstruct the exact
 * path a document took without joining against other tables.
 */
export const buildTransitionAudit = (buildTransitionAudit) => ({
 action: auditActionFor(input.workflow, input.to),
 resourceType_RESOURCE[input.workflow],
 resourceId: input.resourceId,
 oldValues: defined({ status: input.from }),
 newValues: defined({
 status: input.to,
 action: input.verb,
 reference: input.reference ?? undefined,
 reason: input.reason ?? undefined,
 ...input.details,
 }),
});

/**
 * Target state -> notification type. A `null` means the transition is not
 * worth interrupting anyone about, so no notification is raised.
 */
const NOTIFICATION_TYPES>>> = {
 receipt,
 issue,
 purchaseOrder,
 salesOrder,
 transfer,
 count,
 adjustment,
 supplier,
};

/** Rejections and cancellations are the states an operator must notice. */
const PRIORITIES> = {
 REJECTED: 'HIGH',
 CANCELLED: 'MEDIUM',
 PENDING: 'MEDIUM',
 REQUESTED: 'MEDIUM',
};

const TITLES> = {
 LOW_STOCK: 'Low Stock Alert',
 EXPIRING: 'Expiring Stock',
 ORDER_PENDING: 'Order Awaiting Approval',
 ORDER_APPROVED: 'Order Approved',
 ORDER_REJECTED: 'Order Rejected',
 STOCK_TRANSFER: 'Stock Transfer Update',
 RECEIPT_PENDING: 'Stock Receipt Awaiting Approval',
 RECEIPT_RECEIVED: 'Stock Receipt Update',
 ISSUE_PENDING: 'Stock Issue Awaiting Approval',
 ISSUE_APPROVED: 'Stock Issue Update',
 COUNT_VARIANCE: 'Stock Count Variance',
 SYSTEM: 'Workflow Update',
};

const VERB_LABELS> = {
 PENDING: 'submitted for approval',
 REQUESTED: 'requested',
 APPROVED: 'approved',
 REJECTED: 'rejected',
 CANCELLED: 'cancelled',
 RECEIVED: 'received',
 PARTIALLY_RECEIVED: 'partially received',
 ISSUED: 'issued',
 PARTIALLY_ISSUED: 'partially issued',
 DISPATCHED: 'dispatched',
 IN_TRANSIT: 'marked in transit',
 CONFIRMED: 'confirmed',
 COMPLETED: 'completed',
 ADJUSTED: 'adjusted',
};

const RESOURCE_LABELS> = {
 receipt: 'Stock receipt',
 issue: 'Stock issue',
 transfer: 'Stock transfer',
 adjustment: 'Stock adjustment',
 count: 'Stock count',
 purchaseOrder: 'Purchase order',
 salesOrder: 'Sales order',
 supplier: 'Supplier',
};

/**
 * Build the notification raised by a transition, or `null` when the move is
 * routine. Kept separate from the audit entry so a rejected transfer can be
 * audited without also generating a notification, and vice versa.
 */
export const buildTransitionNotification = (
 input) | null => {
 const type = NOTIFICATION_TYPES[input.workflow]?.[input.to];
 if (!type) return null;

 const label = RESOURCE_LABELS[input.workflow];
 const reference = input.reference ? ` ${input.reference}` : '';
 const verb = VERB_LABELS[input.to] ?? `moved to ${input.to.toLowerCase().replace(/_/g, ' ')}`;

 return {
 title[type],
 body: `${label}${reference} ${verb}${input.actorName ? ` by ${input.actorName}` : ''}${
 input.reason ? `. Reason: ${input.reason}` : ''
 }`,
 type,
 priority[input.to] ?? 'MEDIUM',
 };
};

/** Exposed for the permissions/UI map so every workflow has a resource. */
export const workflowResourceTypes = ()[] => Object.values(WORKFLOW_RESOURCE);

export const workflowNames = ()[] => Object.keys(allWorkflows);
