import { prisma } from '../config/database.js';
import { ApiError } from '../errors/ApiError.js';
import { notificationService } from '../../modules/notifications/notifications.service.js';
import { createAuditLog } from '../utils/audit.js';
import { buildTransitionAudit, buildTransitionNotification } from './events.js';
import { assertNoStaleRead, assertTransition } from './state-machine.js';
import { allWorkflows } from './workflows.js';
const delegateFor = (model) => {
    // One cast, confined here: the union above is the real guard on which
    // delegates this runtime may touch, and Prisma's generated delegate union
    // cannot be narrowed by a string key.
    return prisma[model];
};
/**
 * Validate and apply a workflow transition atomically.
 *
 * Throws `ApiError.conflict` (409) when the move is not legal, or when the
 * record moved on underneath the caller. Never partially applies: the status
 * change, the side effects and the audit row share one transaction.
 */
export const runTransition = async (request) => {
    const def = allWorkflows[request.workflow];
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
            throw ApiError.conflict(`This ${allWorkflows[request.workflow].name} is no longer ${request.from}; it was changed by another request. Reload and retry.`);
        }
        if (request.onTransitioned)
            await request.onTransitioned(tx);
        if (request.sideEffects)
            await request.sideEffects(tx);
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
            client: tx,
        });
        return count === 1;
    });
    if (request.notify !== false) {
        await raiseNotification(request);
    }
    return { status: request.to, updated };
};
const raiseNotification = async (request) => {
    const descriptor = buildTransitionNotification({
        workflow: request.workflow,
        to: request.to,
        reference: request.reference ?? null,
        reason: request.reason ?? null,
    });
    if (!descriptor)
        return;
    const recipient = request.notifyUserId ?? request.actorId;
    try {
        await notificationService.dispatch(recipient, {
            ...descriptor,
            data: { workflow: request.workflow, resourceId: request.entityId, ...request.details },
        });
    }
    catch {
        // Notifications are advisory. A failed notification must not fail the
        // workflow step that already committed.
    }
};
export { assertNoStaleRead, assertTransition };
