import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  allowedNext,
  assertNoStaleRead,
  assertTransition,
  canTransition,
  isKnownState,
  isTerminal,
  listTransitions,
  type WorkflowDefinition,
} from '../../src/shared/workflow/state-machine';

type S = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

const simple: WorkflowDefinition<S> = {
  name: 'document',
  states: ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
  initial: 'DRAFT',
  terminal: ['REJECTED', 'CANCELLED'],
  labels: {
    DRAFT: 'draft',
    PENDING: 'pending approval',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled',
  },
  transitions: {
    DRAFT: ['PENDING', 'CANCELLED'],
    PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
    APPROVED: ['CANCELLED'],
  },
};

/** Statuses reachable from the initial state by walking the table. */
const reachable = (def: WorkflowDefinition<string>): Set<string> => {
  const seen = new Set<string>([def.initial]);
  const queue = [def.initial];
  while (queue.length) {
    const current = queue.shift() as string;
    for (const next of def.transitions[current] ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
};

describe('canTransition', () => {
  it('allows a declared transition', () => {
    assert.equal(canTransition(simple, 'DRAFT', 'PENDING'), true);
    assert.equal(canTransition(simple, 'PENDING', 'APPROVED'), true);
  });

  it('refuses a transition that is not in the table', () => {
    assert.equal(canTransition(simple, 'DRAFT', 'APPROVED'), false);
    assert.equal(canTransition(simple, 'PENDING', 'CANCELLED'), true);
    assert.equal(canTransition(simple, 'APPROVED', 'REJECTED'), false);
  });

  it('refuses a self transition unless explicitly declared', () => {
    assert.equal(canTransition(simple, 'APPROVED', 'APPROVED'), false);
  });

  it('refuses any transition out of a terminal state', () => {
    for (const next of simple.states) {
      assert.equal(canTransition(simple, 'REJECTED', next), false);
      assert.equal(canTransition(simple, 'CANCELLED', next), false);
    }
  });
});

describe('allowedNext', () => {
  it('returns the declared targets', () => {
    assert.deepEqual(allowedNext(simple, 'DRAFT'), ['PENDING', 'CANCELLED']);
  });

  it('returns an empty list for a terminal state', () => {
    assert.deepEqual(allowedNext(simple, 'REJECTED'), []);
  });

  it('returns an empty list for an unknown state rather than throwing', () => {
    assert.deepEqual(allowedNext(simple, 'NOT_A_STATE' as S), []);
  });
});

describe('isTerminal', () => {
  it('is true for declared terminal states', () => {
    assert.equal(isTerminal(simple, 'REJECTED'), true);
    assert.equal(isTerminal(simple, 'CANCELLED'), true);
  });

  it('is true for a state with no outgoing transitions', () => {
    const implicit: WorkflowDefinition<S> = {
      ...simple,
      terminal: [],
      transitions: { DRAFT: ['PENDING'] },
    };
    assert.equal(isTerminal(implicit, 'PENDING'), true);
    assert.equal(isTerminal(implicit, 'DRAFT'), false);
  });

  it('is false while transitions remain', () => {
    assert.equal(isTerminal(simple, 'DRAFT'), false);
    assert.equal(isTerminal(simple, 'APPROVED'), false);
  });
});

describe('isKnownState', () => {
  it('accepts declared states', () => {
    assert.equal(isKnownState(simple, 'APPROVED'), true);
  });

  it('rejects undeclared states', () => {
    assert.equal(isKnownState(simple, 'SHIPPED'), false);
  });
});

describe('assertTransition', () => {
  it('passes silently for a legal move', () => {
    assert.doesNotThrow(() => assertTransition(simple, 'PENDING', 'APPROVED'));
  });

  it('throws a 409 conflict for an illegal move', () => {
    assert.throws(
      () => assertTransition(simple, 'DRAFT', 'APPROVED'),
      (error: unknown) => {
        const err = error as { statusCode: number; message: string };
        assert.equal(err.statusCode, 409);
        assert.match(err.message, /Cannot move document from draft to approved/);
        return true;
      },
    );
  });

  it('lists the legal targets in the failure message', () => {
    assert.throws(() => assertTransition(simple, 'DRAFT', 'REJECTED'), (error: unknown) => {
      const err = error as { message: string };
      assert.match(err.message, /Allowed from draft: pending approval, cancelled/);
      return true;
    });
  });

  it('can suppress the allowed-targets hint', () => {
    assert.throws(
      () => assertTransition(simple, 'DRAFT', 'APPROVED', { describeAllowed: false }),
      (error: unknown) => {
        assert.doesNotMatch((error as Error).message, /Allowed from/);
        return true;
      },
    );
  });

  it('uses an explicit message when one is supplied', () => {
    assert.throws(
      () =>
        assertTransition(simple, 'APPROVED', 'REJECTED', {
          message: 'Approved documents cannot be rejected',
        }),
      (error: unknown) => {
        assert.equal((error as Error).message, 'Approved documents cannot be rejected');
        return true;
      },
    );
  });

  it('reports a 400 for an unknown source state', () => {
    assert.throws(
      () => assertTransition(simple, 'GHOST' as S, 'APPROVED'),
      (error: unknown) => {
        assert.equal((error as unknown as { statusCode: number }).statusCode, 400);
        return true;
      },
    );
  });

  it('reports a 400 for an unknown target state', () => {
    assert.throws(
      () => assertTransition(simple, 'DRAFT', 'GHOST' as S),
      (error: unknown) => {
        assert.equal((error as unknown as { statusCode: number }).statusCode, 400);
        return true;
      },
    );
  });

  it('rejects re-entering a state, so a second approval cannot succeed', () => {
    // The scenario this protects: two approvers open the same document.
    assert.doesNotThrow(() => assertTransition(simple, 'PENDING', 'APPROVED'));
    assert.throws(
      () => assertTransition(simple, 'APPROVED', 'APPROVED'),
      (error: unknown) => {
        assert.equal((error as unknown as { statusCode: number }).statusCode, 409);
        return true;
      },
    );
  });
});

describe('assertNoStaleRead', () => {
  it('passes when the state has not moved', () => {
    assert.doesNotThrow(() => assertNoStaleRead(simple, 'PENDING', 'PENDING', 'Document #1'));
  });

  it('throws a 409 when the state moved underneath the caller', () => {
    assert.throws(
      () => assertNoStaleRead(simple, 'PENDING', 'APPROVED', 'Document #1'),
      (error: unknown) => {
        const err = error as { statusCode: number; message: string };
        assert.equal(err.statusCode, 409);
        assert.match(err.message, /changed from pending approval to approved/);
        return true;
      },
    );
  });
});

describe('listTransitions', () => {
  it('flattens the table into every legal move', () => {
    const all = listTransitions(simple);
    assert.equal(all.length, 6);
    assert.ok(all.some((t) => t.from === 'DRAFT' && t.to === 'PENDING'));
    assert.ok(all.some((t) => t.from === 'PENDING' && t.to === 'REJECTED'));
  });
});

describe('graph invariants', () => {
  it('only ever targets declared states', () => {
    for (const [from, targets] of Object.entries(simple.transitions)) {
      assert.ok(simple.states.includes(from as S), `${from} is not a declared state`);
      for (const to of targets) {
        assert.ok(simple.states.includes(to), `${from} -> ${to} targets an undeclared state`);
      }
    }
  });

  it('reaches every declared state from the initial state', () => {
    assert.deepEqual(reachable(simple), new Set(simple.states));
  });
});
