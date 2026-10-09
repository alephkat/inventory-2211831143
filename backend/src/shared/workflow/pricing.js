import { round2 } from './guards.js';
export const priceLine = (input) => {
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
export const sumLines = (lines) => {
    const totals = lines.reduce((acc, line) => ({
        subtotal: round2(acc.subtotal + line.subtotal),
        discountAmount: round2(acc.discountAmount + line.discountAmount),
        taxAmount: round2(acc.taxAmount + line.taxAmount),
        total: round2(acc.total + line.total),
    }), { subtotal: 0, discountAmount: 0, taxAmount: 0, total: 0 });
    // Derive the total from the components so the header can never drift from
    // the lines by a rounding cent.
    totals.total = round2(totals.subtotal - totals.discountAmount + totals.taxAmount);
    return totals;
};
export const priceLines = (lines) => {
    const priced = lines.map(priceLine);
    return { priced, totals: sumLines(priced) };
};
