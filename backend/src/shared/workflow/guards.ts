import { ApiError } from '../errors/ApiError';

/**
 * Pure domain guards shared by the inventory workflows.
 *
 * Every function here is side-effect free and operates on plain values, so
 * the rules can be unit tested without a database and reused by routes,
 * services and (via the API error shape) surfaced cleanly to clients.
 */

/** Money and computed values are rounded to minor units to avoid float drift. */
export const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export const assertFiniteNumber = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw ApiError.badRequest(`${field} must be a finite number`);
  }
  return value;
};

export const assertPositiveQuantity = (value: number, field: string): number => {
  assertFiniteNumber(value, field);
  if (value <= 0) {
    throw ApiError.badRequest(`${field} must be greater than zero`);
  }
  return value;
};

export const assertNonNegativeQuantity = (value: number, field: string): number => {
  assertFiniteNumber(value, field);
  if (value < 0) {
    throw ApiError.badRequest(`${field} cannot be negative`);
  }
  return value;
};

export const assertNonNegativePercent = (value: number, field: string): number => {
  assertFiniteNumber(value, field);
  if (value < 0 || value > 100) {
    throw ApiError.badRequest(`${field} must be between 0 and 100`);
  }
  return value;
};

export const assertSufficientStock = (
  available: number,
  requested: number,
  field: string,
): void => {
  assertPositiveQuantity(requested, field);
  if (requested > available) {
    throw ApiError.conflict(
      `${field} is ${requested} but only ${round2(available)} is available in stock`,
    );
  }
};

export const assertDistinctWarehouses = (fromId: string, toId: string): void => {
  if (fromId === toId) {
    throw ApiError.badRequest('Source and destination warehouses must be different');
  }
};

export const assertLinesPresent = (lines: unknown[], entity = 'Line item'): void => {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw ApiError.badRequest(`At least one ${entity.toLowerCase()} is required`);
  }
};

/**
 * Reject repeated product lines. Two lines for the same product would make
 * the received/issued totals ambiguous and break per-line PO matching.
 */
export const assertNoDuplicateLines = <T>(
  lines: readonly T[],
  keyOf: (line: T) => string,
  entity = 'line',
): void => {
  const seen = new Set<string>();
  for (const line of lines) {
    const key = keyOf(line);
    if (seen.has(key)) {
      throw ApiError.badRequest(`Duplicate ${entity} for ${key}`);
    }
    seen.add(key);
  }
};

export const assertWithinVarianceTolerance = (
  variancePercent: number,
  tolerancePercent: number,
  field = 'Count variance',
): void => {
  assertNonNegativePercent(tolerancePercent, 'Variance tolerance');
  if (variancePercent > tolerancePercent) {
    throw ApiError.conflict(
      `${field} of ${round2(variancePercent)}% exceeds the configured tolerance of ${round2(
        tolerancePercent,
      )}%`,
    );
  }
};

export interface CountVariance {
  /** countedQuantity - systemQuantity */
  difference: number;
  /** difference * costPrice, the money impact of the variance. */
  value: number;
  /** absolute difference as a percentage of the system quantity. */
  percent: number;
}

/**
 * Variance of a single counted line. A system quantity of zero is reported as
 * a 100% variance (the entire count is unexpected stock) rather than dividing
 * by zero to produce Infinity or NaN.
 */
export const computeCountVariance = (
  systemQuantity: number,
  countedQuantity: number,
  costPrice: number,
): CountVariance => {
  const difference = round2(countedQuantity - systemQuantity);
  const value = round2(difference * costPrice);
  const percent = systemQuantity === 0 ? (difference === 0 ? 0 : 100) : round2((Math.abs(difference) / systemQuantity) * 100);
  return { difference, value, percent };
};

/** Quantity of a purchase-order line that is still outstanding. */
export const remainingPurchaseQuantity = (ordered: number, alreadyReceived: number): number =>
  round2(Math.max(0, ordered - alreadyReceived));

/** Every PO line fully received? Drives RECEIVED vs PARTIALLY_RECEIVED. */
export const isFullyReceived = (
  lines: ReadonlyArray<{ quantity: number; receivedQuantity: number }>,
): boolean => lines.every((line) => line.receivedQuantity >= line.quantity);

/** Every line moved at least a little? Drives ISSUED vs PARTIALLY_ISSUED. */
export const isFullyIssued = (
  lines: ReadonlyArray<{ requestedQuantity: number; issuedQuantity: number }>,
): boolean => lines.every((line) => line.issuedQuantity >= line.requestedQuantity);
