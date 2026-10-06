import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  auditActionFor,
  buildTransitionAudit,
  buildTransitionNotification,
  WORKFLOW_RESOURCE,
  workflowResourceTypes,
} from '../../src/shared/workflow/events';
import { allWorkflows, type WorkflowKey } from '../../src/shared/workflow/workflows';
import type { NotificationType } from '@prisma/client';

const entries = Object.keys(allWorkflows) as WorkflowKey[];

describe('auditActionFor', () => {
  it('records approvals as APPROVE', () => {
    for (const workflow of ['receipt', 'issue', 'transfer', 'adjustment', 'count', 'purchaseOrder', 'salesOrder', 'supplier'] as WorkflowKey[]) {
      if (!allWorkflows[workflow].states.includes('APPROVED' as never)) continue;
      assert.equal(auditActionFor(workflow, 'APPROVED'), 'APPROVE', workflow);
    }
  });

  it('records rejections as REJECT', () => {
    for (const workflow of entries) {
      if (!allWorkflows[workflow].states.includes('REJECTED' as never)) continue;
      assert.equal(auditActionFor(workflow, 'REJECTED'), 'REJECT', workflow);
    }
  });

  it('uses a verb that matches what the move actually did', () => {
    assert.equal(auditActionFor('receipt', 'RECEIVED'), 'RECEIVE');
    assert.equal(auditActionFor('issue', 'ISSUED'), 'ISSUE');
    assert.equal(auditActionFor('transfer', 'DISPATCHED'), 'DISPATCH');
    assert.equal(auditActionFor('transfer', 'CONFIRMED'), 'CONFIRM');
    assert.equal(auditActionFor('adjustment', 'COMPLETED'), 'ADJUST');
    assert.equal(auditActionFor('count', 'COMPLETED'), 'COUNT');
    assert.equal(auditActionFor('count', 'ADJUSTED'), 'ADJUST');
  });

  it('falls back to UPDATE for bookkeeping moves', () => {
    // Submitting, reviewing and cancelling are state changes, not acts of
    // creation, approval or movement.
    assert.equal(auditActionFor('purchaseOrder', 'PENDING'), 'UPDATE');
    assert.equal(auditActionFor('receipt', 'CANCELLED'), 'UPDATE');
    assert.equal(auditActionFor('supplier', 'INACTIVE'), 'UPDATE');
  });

  it('never returns an action outside the AuditAction enum', () => {
    const valid = new Set([
      'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'APPROVE', 'REJECT',
      'RECEIVE', 'ISSUE', 'TRANSFER', 'ADJUST', 'COUNT', 'DISPATCH', 'CONFIRM', 'OVERRIDE',
    ]);
    for (const workflow of entries) {
      for (const state of allWorkflows[workflow].states) {
        assert.ok(
          valid.has(auditActionFor(workflow, state)),
          `${workflow}.${state} maps to an invalid audit action`,
        );
      }
    }
  });

  it('has a mapping for every state of every workflow', () => {
    for (const workflow of entries) {
      for (const state of allWorkflows[workflow].states) {
        assert.doesNotThrow(
          () => auditActionFor(workflow, state),
          `${workflow}.${state} has no audit action`,
        );
      }
    }
  });
});

describe('buildTransitionAudit', () => {
  it('records the resource type for the workflow', () => {
    const entry = buildTransitionAudit({
      workflow: 'receipt',
      resourceId: 'r-1',
      from: 'PENDING',
      to: 'APPROVED',
      verb: 'approve',
    });
    assert.equal(entry.resourceType, 'stock_receipt');
    assert.equal(entry.action, 'APPROVE');
  });

  it('records both the old and the new status', () => {
    const entry = buildTransitionAudit({
      workflow: 'issue',
      resourceId: 'i-1',
      from: 'APPROVED',
      to: 'PARTIALLY_ISSUED',
      verb: 'issue',
    });
    assert.equal(entry.oldValues.status, 'APPROVED');
    assert.equal(entry.newValues.status, 'PARTIALLY_ISSUED');
  });

  it('records the acting verb so the trail says what was done, not just the state', () => {
    const entry = buildTransitionAudit({
      workflow: 'transfer',
      resourceId: 't-1',
      from: 'DISPATCHED',
      to: 'IN_TRANSIT',
      verb: 'mark in transit',
    });
    assert.equal(entry.newValues.action, 'mark in transit');
  });

  it('carries a rejection reason through to the audit row', () => {
    const entry = buildTransitionAudit({
      workflow: 'receipt',
      resourceId: 'r-1',
      from: 'PENDING',
      to: 'REJECTED',
      verb: 'reject',
      reason: 'damaged in transit',
    });
    assert.equal(entry.newValues.reason, 'damaged in transit');
  });

  it('omits absent optional fields rather than writing nulls', () => {
    const entry = buildTransitionAudit({
      workflow: 'count',
      resourceId: 'c-1',
      from: 'DRAFT',
      to: 'IN_PROGRESS',
      verb: 'start counting',
    });
    assert.equal('reason' in entry.newValues, false);
    assert.equal('reference' in entry.newValues, false);
  });

  it('keeps a null reason out of the payload', () => {
    const entry = buildTransitionAudit({
      workflow: 'count',
      resourceId: 'c-1',
      from: 'DRAFT',
      to: 'IN_PROGRESS',
      verb: 'start counting',
      reason: null,
    });
    assert.equal('reason' in entry.newValues, false);
  });

  it('merges extra details into the new values', () => {
    const entry = buildTransitionAudit({
      workflow: 'count',
      resourceId: 'c-1',
      from: 'REVIEWED',
      to: 'APPROVED',
      verb: 'approve count',
      details: { worstVariancePercent: 3.5, tolerancePercent: 5 },
    });
    assert.equal(entry.newValues.worstVariancePercent, 3.5);
    assert.equal(entry.newValues.tolerancePercent, 5);
  });

  it('includes the document reference when there is one', () => {
    const entry = buildTransitionAudit({
      workflow: 'issue',
      resourceId: 'i-1',
      from: 'PENDING',
      to: 'APPROVED',
      verb: 'approve',
      reference: 'ISS-20260928-A1B2C3',
    });
    assert.equal(entry.newValues.reference, 'ISS-20260928-A1B2C3');
  });
});

describe('buildTransitionNotification', () => {
  const validTypes = new Set<string>([
    'LOW_STOCK', 'EXPIRING', 'ORDER_PENDING', 'ORDER_APPROVED', 'ORDER_REJECTED',
    'STOCK_TRANSFER', 'RECEIPT_PENDING', 'RECEIPT_RECEIVED', 'ISSUE_PENDING',
    'ISSUE_APPROVED', 'COUNT_VARIANCE', 'SYSTEM',
  ]);

  it('raises nothing for routine bookkeeping moves', () => {
    // Drafting, completing and cancelling are not news; the transitions that
    // need a human (submitted, approved, rejected) are.
    assert.equal(buildTransitionNotification({ workflow: 'purchaseOrder', to: 'DRAFT' }), null);
    assert.equal(buildTransitionNotification({ workflow: 'purchaseOrder', to: 'COMPLETED' }), null);
    assert.equal(buildTransitionNotification({ workflow: 'adjustment', to: 'PENDING' }), null);
  });

  it('does notify the approval queue when a document is submitted', () => {
    const notification = buildTransitionNotification({
      workflow: 'purchaseOrder',
      to: 'PENDING',
      reference: 'PO-1',
    });
    assert.equal(notification?.type, 'ORDER_PENDING');
  });

  it('notifies the approval queue when a document is submitted', () => {
    const notification = buildTransitionNotification({
      workflow: 'receipt',
      to: 'PENDING',
      reference: 'RCPT-1',
    });
    assert.equal(notification?.type, 'RECEIPT_PENDING');
    assert.match(notification!.body, /RCPT-1/);
  });

  it('raises a high-priority notification on rejection', () => {
    const notification = buildTransitionNotification({ workflow: 'issue', to: 'REJECTED' });
    assert.equal(notification?.priority, 'HIGH');
  });

  it('includes the reason when one was given', () => {
    const notification = buildTransitionNotification({
      workflow: 'transfer',
      to: 'REJECTED',
      reason: 'destination closed',
    });
    assert.match(notification!.body, /destination closed/);
  });

  it('names the acting user when known', () => {
    const notification = buildTransitionNotification({
      workflow: 'count',
      to: 'ADJUSTED',
      actorName: 'Dana Okafor',
    });
    assert.match(notification!.body, /by Dana Okafor/);
  });

  it('only ever produces types that exist in the NotificationType enum', () => {
    for (const workflow of entries) {
      for (const state of allWorkflows[workflow].states) {
        const notification = buildTransitionNotification({ workflow, to: state });
        if (!notification) continue;
        assert.ok(
          validTypes.has(notification.type),
          `${workflow}.${state} produced an unknown notification type ${notification.type}`,
        );
        assert.ok(
          validTypes.has(notification.type as NotificationType),
          `${workflow}.${state} notification type is not in the enum`,
        );
      }
    }
  });

  it('always produces a title and a body', () => {
    for (const workflow of entries) {
      for (const state of allWorkflows[workflow].states) {
        const notification = buildTransitionNotification({ workflow, to: state });
        if (!notification) continue;
        assert.ok(notification.title.length > 0, `${workflow}.${state} has an empty title`);
        assert.ok(notification.body.length > 0, `${workflow}.${state} has an empty body`);
      }
    }
  });
});

describe('workflow resource types', () => {
  it('gives every workflow a distinct audit resource type', () => {
    const types = workflowResourceTypes();
    assert.equal(new Set(types).size, types.length);
  });

  it('uses snake_case so the audit log filters readably', () => {
    for (const type of workflowResourceTypes()) {
      assert.match(type, /^[a-z_]+$/);
    }
  });

  it('covers every registered workflow', () => {
    assert.equal(workflowResourceTypes().length, entries.length);
  });

  it('exposes the mapping for each workflow key', () => {
    for (const key of entries) {
      assert.equal(typeof WORKFLOW_RESOURCE[key], 'string');
    }
  });
});
