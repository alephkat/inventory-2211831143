import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertDistinctWarehouses,
  assertLinesPresent,
  assertNoDuplicateLines,
  assertNonNegativePercent,
  assertNonNegativeQuantity,
  assertPositiveQuantity,
  assertSufficientStock,
  assertWithinVarianceTolerance,
  computeCountVariance,
  isFullyIssued,
  isFullyReceived,
  remainingPurchaseQuantity,
  round2,
} from '../../src/shared/workflow/guards';

const statusOf = (fn: () => unknown): number => {
  try {
    fn();
  } catch (error) {
    return (error as { statusCode: number }).statusCode;
  }
  throw new Error('expected the call to throw');
};

describe('round2', () => {
  it('removes binary floating point drift', () => {
    assert.equal(round2(0.1 + 0.2), 0.3);
    assert.equal(round2(1.005), 1.01);
  });

  it('leaves already-clean values alone', () => {
    assert.equal(round2(42), 42);
    assert.equal(round2(0), 0);
  });
});

describe('assertPositiveQuantity', () => {
  it('accepts a positive quantity', () => {
    assert.equal(assertPositiveQuantity(0.001, 'Quantity'), 0.001);
  });

  it('rejects zero', () => {
    assert.throws(() => assertPositiveQuantity(0, 'Quantity'), /greater than zero/);
  });

  it('rejects a negative quantity', () => {
    assert.throws(() => assertPositiveQuantity(-1, 'Quantity'), /greater than zero/);
  });

  it('rejects NaN and Infinity', () => {
    assert.throws(() => assertPositiveQuantity(Number.NaN, 'Quantity'), /finite number/);
    assert.throws(() => assertPositiveQuantity(Number.POSITIVE_INFINITY, 'Quantity'), /finite/);
  });

  it('is a 400, because the request body is wrong', () => {
    assert.equal(statusOf(() => assertPositiveQuantity(0, 'Quantity')), 400);
  });
});

describe('assertNonNegativeQuantity', () => {
  it('accepts zero, which a cycle count legitimately reports', () => {
    assert.equal(assertNonNegativeQuantity(0, 'Counted quantity'), 0);
  });

  it('rejects a negative quantity', () => {
    assert.throws(() => assertNonNegativeQuantity(-0.5, 'Counted quantity'), /cannot be negative/);
  });
});

describe('assertNonNegativePercent', () => {
  it('accepts the full 0-100 range', () => {
    assert.equal(assertNonNegativePercent(0, 'Tax'), 0);
    assert.equal(assertNonNegativePercent(100, 'Tax'), 100);
  });

  it('rejects out-of-range percentages', () => {
    assert.throws(() => assertNonNegativePercent(-1, 'Tax'), /between 0 and 100/);
    assert.throws(() => assertNonNegativePercent(101, 'Tax'), /between 0 and 100/);
  });
});

describe('assertSufficientStock', () => {
  it('allows issuing exactly the available quantity', () => {
    assert.doesNotThrow(() => assertSufficientStock(10, 10, 'Stock'));
  });

  it('rejects issuing more than is available', () => {
    assert.throws(() => assertSufficientStock(10, 10.01, 'Stock'), /only 10 is available/);
  });

  it('rejects any issue at all when nothing is stocked', () => {
    assert.throws(() => assertSufficientStock(0, 1, 'Stock'), /is 1 but only 0 is available/);
  });

  it('is a 409 conflict, not a bad request: the stock moved, the request did not', () => {
    assert.equal(statusOf(() => assertSufficientStock(1, 5, 'Stock')), 409);
  });

  it('includes the product in the message so the error is actionable', () => {
    assert.throws(
      () => assertSufficientStock(2, 5, 'Available stock for Widget'),
      /Available stock for Widget/,
    );
  });
});

describe('assertDistinctWarehouses', () => {
  it('rejects a transfer to the same warehouse', () => {
    assert.throws(() => assertDistinctWarehouses('a', 'a'), /must be different/);
  });

  it('accepts a transfer between two warehouses', () => {
    assert.doesNotThrow(() => assertDistinctWarehouses('a', 'b'));
  });
});

describe('assertLinesPresent', () => {
  it('rejects an empty document', () => {
    assert.throws(() => assertLinesPresent([], 'Receipt line item'), /at least one receipt line item/i);
  });

  it('rejects a non-array and falls back to a generic entity name', () => {
    assert.throws(() => assertLinesPresent(undefined as unknown as unknown[]), /at least one line item/i);
  });
});

describe('assertNoDuplicateLines', () => {
  it('rejects two lines for the same key', () => {
    assert.throws(
      () => assertNoDuplicateLines([{ productId: 'a' }, { productId: 'a' }], (l) => l.productId),
      /Duplicate line for a/,
    );
  });

  it('accepts distinct keys', () => {
    assert.doesNotThrow(() =>
      assertNoDuplicateLines([{ productId: 'a' }, { productId: 'b' }], (l) => l.productId),
    );
  });

  it('names the entity so the message is specific to the caller', () => {
    assert.throws(
      () => assertNoDuplicateLines([{ productId: 'a' }, { productId: 'a' }], (l) => l.productId, 'issue line for product'),
      /Duplicate issue line for product for a/,
    );
  });
});

describe('assertWithinVarianceTolerance', () => {
  it('allows variance at exactly the tolerance', () => {
    assert.doesNotThrow(() => assertWithinVarianceTolerance(5, 5));
  });

  it('rejects variance beyond the tolerance', () => {
    assert.throws(() => assertWithinVarianceTolerance(5.1, 5), /exceeds the configured tolerance/);
  });

  it('is a conflict, so a client can distinguish it from a validation error', () => {
    assert.equal(statusOf(() => assertWithinVarianceTolerance(50, 5)), 409);
  });
});

describe('computeCountVariance', () => {
  it('reports zero variance when the count matches the system', () => {
    assert.deepEqual(computeCountVariance(10, 10, 5), { difference: 0, value: 0, percent: 0 });
  });

  it('reports a positive variance for an overage', () => {
    const variance = computeCountVariance(10, 12, 2);
    assert.equal(variance.difference, 2);
    assert.equal(variance.value, 4);
    assert.equal(variance.percent, 20);
  });

  it('reports a negative variance and negative value for a shortage', () => {
    const variance = computeCountVariance(10, 8, 2);
    assert.equal(variance.difference, -2);
    assert.equal(variance.value, -4);
    assert.equal(variance.percent, 20);
  });

  it('treats unexpected stock in an empty bin as 100% variance, not Infinity', () => {
    const variance = computeCountVariance(0, 5, 1);
    assert.equal(variance.difference, 5);
    assert.equal(variance.percent, 100);
    assert.ok(Number.isFinite(variance.percent));
  });

  it('reports zero variance for an empty bin that counted empty', () => {
    assert.deepEqual(computeCountVariance(0, 0, 1), { difference: 0, value: 0, percent: 0 });
  });

  it('uses the absolute difference for the percentage so over and under both trip tolerance', () => {
    assert.equal(computeCountVariance(100, 90, 1).percent, 10);
    assert.equal(computeCountVariance(100, 110, 1).percent, 10);
  });
});

describe('remainingPurchaseQuantity', () => {
  it('returns what is still outstanding', () => {
    assert.equal(remainingPurchaseQuantity(100, 40), 60);
  });

  it('returns zero when fully received', () => {
    assert.equal(remainingPurchaseQuantity(100, 100), 0);
  });

  it('clamps to zero when over-received, so it can never go negative', () => {
    assert.equal(remainingPurchaseQuantity(100, 120), 0);
  });

  it('survives float drift', () => {
    assert.equal(remainingPurchaseQuantity(0.3, 0.1), 0.2);
  });
});

describe('isFullyReceived', () => {
  it('is false when any line is outstanding', () => {
    assert.equal(isFullyReceived([{ quantity: 10, receivedQuantity: 10 }, { quantity: 5, receivedQuantity: 4 }]), false);
  });

  it('is true only when every line is filled', () => {
    assert.equal(isFullyReceived([{ quantity: 10, receivedQuantity: 10 }, { quantity: 5, receivedQuantity: 5 }]), true);
  });

  it('is vacuously true for a document with no lines', () => {
    assert.equal(isFullyReceived([]), true);
  });
});

describe('isFullyIssued', () => {
  it('is false when any line is outstanding', () => {
    assert.equal(isFullyIssued([{ requestedQuantity: 4, issuedQuantity: 4 }, { requestedQuantity: 3, issuedQuantity: 1 }]), false);
  });

  it('is true when every line is fully issued', () => {
    assert.equal(isFullyIssued([{ requestedQuantity: 4, issuedQuantity: 4 }]), true);
  });

  it('is true when a line was over-issued under an override', () => {
    assert.equal(isFullyIssued([{ requestedQuantity: 4, issuedQuantity: 6 }]), true);
  });
});
