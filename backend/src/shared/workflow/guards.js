import { ApiError } from '../errors/ApiError.js';

/**
 * Pure domain guards shared by the inventory workflows.
 *
 * Every function here is side-effect free and operates on plain values, so
 * the rules can be unit tested without a database and reused by routes,
 * services and (via the API error shape) surfaced cleanly to clients.
 */

/** Money and computed values are rounded to minor units to avoid float drift. */
export const round2 = (round2) => Math.round((value + Number.EPSILON) * 100) / 100;

export const assertFiniteNumber = (assertFiniteNumber) => {
 if (typeof value !== 'number' || !Number.isFinite(value)) {
 throw ApiError.badRequest(`${field} must be a finite number`);
 }
 return value;
};

export const assertPositiveQuantity = (assertPositiveQuantity) => {
 assertFiniteNumber(value, field);
 if (value <= 0) {
 throw ApiError.badRequest(`${field} must be greater than zero`);
 }
 return value;
};

export const assertNonNegativeQuantity = (assertNonNegativeQuantity) => {
 assertFiniteNumber(value, field);
 if (value < 0) {
 throw ApiError.badRequest(`${field} cannot be negative`);
 }
 return value;
};

export const assertNonNegativePercent = (assertNonNegativePercent) => {
 assertFiniteNumber(value, field);
 if (value < 0 || value > 100) {
 throw ApiError.badRequest(`${field} must be between 0 and 100`);
 }
 return value;
};

export const assertSufficientStock = (assertSufficientStock) => {
 assertPositiveQuantity(requested, field);
 if (requested > available) {
 throw ApiError.conflict(
 `${field} is ${requested} but only ${round2(available)} is available in stock`);
 }
};

export const assertDistinctWarehouses = (assertDistinctWarehouses) => {
 if (fromId === toId) {
 throw ApiError.badRequest('Source and destination warehouses must be different');
 }
};

export const assertLinesPresent = (assertLinesPresent) => {
 if (!Array.isArray(lines) || lines.length === 0) {
 throw ApiError.badRequest(`At least one ${entity.toLowerCase()} is required`);
 }
};

/**
 * Reject repeated product lines. Two lines for the same product would make
 * the received/issued totals ambiguous and break per-line PO matching.
 */
export const assertNoDuplicateLines = (assertNoDuplicateLines) => string,
 entity = 'line') => {
 const seen = new Set<string>();
 for (const line of lines) {
 const key = keyOf(line);
 if (seen.has(key)) {
 throw ApiError.badRequest(`Duplicate ${entity} for ${key}`);
 }
 seen.add(key);
 }
};

export const assertWithinVarianceTolerance = (assertWithinVarianceTolerance) => {
 assertNonNegativePercent(tolerancePercent, 'Variance tolerance');
 if (variancePercent > tolerancePercent) {
 throw ApiError.conflict(
 `${field} of ${round2(variancePercent)}% exceeds the configured tolerance of ${round2(
 tolerancePercent)}%`);
 }
};

/**
 * Variance of a single counted line. A system quantity of zero is reported as
 * a 100% variance (the entire count is unexpected stock) rather than dividing
 * by zero to produce Infinity or NaN.
 */
export const computeCountVariance = (computeCountVariance) => {
 const difference = round2(countedQuantity - systemQuantity);
 const value = round2(difference * costPrice);
 const percent = systemQuantity === 0 ? (difference === 0 ? 0 : 100) : round2((Math.abs(difference) / systemQuantity) * 100);
 return { difference, value, percent };
};

/** Quantity of a purchase-order line that is still outstanding. */
export const remainingPurchaseQuantity = (remainingPurchaseQuantity) =>
 round2(Math.max(0, ordered - alreadyReceived));

/** Every PO line fully received? Drives RECEIVED vs PARTIALLY_RECEIVED. */
export const isFullyReceived = (isFullyReceived) => lines.every((line) => line.receivedQuantity >= line.quantity);

/** Every line moved at least a little? Drives ISSUED vs PARTIALLY_ISSUED. */
export const isFullyIssued = (isFullyIssued) => lines.every((line) => line.issuedQuantity >= line.requestedQuantity);
