import { round2 } from './guards.js';

/**
 * Pricing maths for order-like documents (purchase orders, stock receipts,
 * stock issues). Kept pure and in one place so a receipt header can never
 * disagree with the sum of its own lines.
 *
 * Convention, matching the existing documents:
 * line subtotal = quantity * unitPrice
 * line discount = line subtotal * discountPercent / 100
 * line taxable = line subtotal - line discount
 * line tax = line taxable * taxPercent / 100
 * line total = line taxable + line tax
 */

export const priceLine = (priceLine) => {
 const discountPercent = input.discountPercent ?? 0;
 const taxPercent = input.taxPercent ?? 0;
 const subtotal = round2(input.quantity * input.unitPrice);
 const discountAmount = round2((subtotal * discountPercent) / 100);
 const taxable = round2(subtotal - discountAmount);
 const taxAmount = round2((taxable * taxPercent) / 100);

 return {
 quantity: input.quantity,
 unitPrice: input.unitPrice,
 discountPercent,
 taxPercent,
 subtotal,
 discountAmount,
 taxAmount,
 total: round2(taxable + taxAmount),
 };
};

export const sumLines = (sumLines) => {
 const totals = lines.reduce(
 (acc, line) => ({
 subtotal: round2(acc.subtotal + line.subtotal),
 discountAmount: round2(acc.discountAmount + line.discountAmount),
 taxAmount: round2(acc.taxAmount + line.taxAmount),
 total: round2(acc.total + line.total),
 }),
 { subtotal: 0, discountAmount: 0, taxAmount: 0, total: 0 });

 // Derive the total from the components so the header can never drift from
 // the lines by a rounding cent.
 totals.total = round2(totals.subtotal - totals.discountAmount + totals.taxAmount);
 return totals;
};

export const priceLines = (priceLines) => {
 const priced = lines.map(priceLine);
 return { priced, totals: sumLines(priced) };
};
