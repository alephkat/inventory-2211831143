import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError } from '../errors/ApiError';
import { notificationService } from '../../modules/notifications/notifications.service';
import { createAuditLog } from '../utils/audit';
import { buildTransitionAudit, buildTransitionNotification } from './events';
import { assertNoStaleRead, assertTransition, type WorkflowDefinition } from './state-machine';
import { allWorkflows, type WorkflowKey } from './workflows';

/**
 * Runtime that every stateful workflow service drives its transitions
 * through. It provides four things that are easy to get subtly wrong when
 * repeated by hand in each service:
 *
 *  1. Transition validation from the shared tables, before any write.
 *  2. An optimistic-concurrency guard, so two approvers racing on the same
 *     record cannot both apply the effect.
 *  3. An audit entry that is part of the same transaction as the change.
 *  4. A notification raised from the same event, on a best-effort basis.
 */

/** Prisma delegate names this runtime is allowed to write through. */
export type WorkflowModel =
  | 'stockReceipt'
  | 'stockIssue'
  | 'stockTransfer'
  | 'stockAdjustment'
  | 'stockCount'
  | 'purchaseOrder'
  | 'salesOrder'
  | 'supplier';

export interface TransitionRequest<S extends string> {
  workflow: WorkflowKey;
  model: WorkflowModel;
  entityId: string;
  /** Status the caller observed before starting work. */
  from: S;
  /** Status being moved to. Validated against the workflow table. */
  to: S;
  /** Human-readable verb recorded in the audit entry, e.g. `receive`. */
  verb: string;
  actorId: string;
  /** Document number shown in notifications, e.g. `RCPT-20260101-AB12CD`. */
  reference?: string | null;
  reason?: string | null;
  details?: Record<string, unknown>;
  /** Extra columns stamped alongside `status` (approver ids, timestamps). */
  patch?: Record<string, unknown>;
  /** Work that must succeed or roll back together with the status change. */
  sideEffects?: (tx: Prisma.TransactionClient) => Promise<void>;
  /** Append to the workflow's own history table, when it has one. */
  onTransitioned?: (tx: Prisma.TransactionClient) => Promise<void>;
  /** Override the notification recipient. Defaults to the actor. */
  notifyUserId?: string | null;
  /** Set false for bookkeeping moves that should stay silent. */
  notify?: boolean;
}

export interface TransitionResult {
  status: string;
  updated: boolean;
}

const delegateFor = (model: WorkflowModel) => {
  // One cast, confined here: the union above is the real guard on which
  // delegates this runtime may touch, and Prisma's generated delegate union
  // cannot be narrowed by a string key.
  return (prisma as unknown as Record<WorkflowModel, PrismaDelegate>)[model];
};

interface PrismaDelegate {
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
}

/**
 * Validate and apply a workflow transition atomically.
 *
 * Throws `ApiError.conflict` (409) when the move is not legal, or when the
 * record moved on underneath the caller. Never partially applies: the status
 * change, the side effects and the audit row share one transaction.
 */
export const runTransition = async <S extends string>(
  request: TransitionRequest<S>,
): Promise<TransitionResult> => {
  const def: WorkflowDefinition<S> = allWorkflows[request.workflow] as WorkflowDefinition<S>;

  assertTransition(def, request.from, request.to);

  const updated = await prisma.$transaction(async (tx) => {
    // Guarded update: `status: from` means a concurrent transition that
    // already moved the record makes this update a no-op instead of a
    // double application of the effect.
    const { count } = await delegateFor(request.model).updateMany({
      where: { id: request.entityId, status: request.from },
      data: { status: request.to, ...(request.patch ?? {}) },
    });

    if (count === 0) {
      throw ApiError.conflict(
        `This ${allWorkflows[request.workflow].name} is no longer ${request.from}; it was changed by another request. Reload and retry.`,
      );
    }

    if (request.onTransitioned) await request.onTransitioned(tx);
    if (request.sideEffects) await request.sideEffects(tx);

    const entry = buildTransitionAudit({
      workflow: request.workflow,
      resourceId: request.entityId,
      from: request.from,
      to: request.to,
      verb: request.verb,
      reference: request.reference ?? null,
      reason: request.reason ?? null,
      details: request.details,
    });

    await createAuditLog({
      userId: request.actorId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      oldValues: entry.oldValues,
      newValues: entry.newValues,
      client: tx as unknown as typeof prisma,
    });

    return count === 1;
  });

  if (request.notify !== false) {
    await raiseNotification(request);
  }

  return { status: request.to, updated };
};

const raiseNotification = async <S extends string>(request: TransitionRequest<S>): Promise<void> => {
  const descriptor = buildTransitionNotification({
    workflow: request.workflow,
    to: request.to,
    reference: request.reference ?? null,
    reason: request.reason ?? null,
  });
  if (!descriptor) return;

  const recipient = request.notifyUserId ?? request.actorId;
  try {
    await notificationService.dispatch(recipient, {
      ...descriptor,
      data: { workflow: request.workflow, resourceId: request.entityId, ...request.details },
    });
  } catch {
    // Notifications are advisory. A failed notification must not fail the
    // workflow step that already committed.
  }
};

export { assertNoStaleRead, assertTransition };
