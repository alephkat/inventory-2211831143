import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { priceLine, priceLines, sumLines } from "../../src/shared/workflow/pricing.js";
describe("priceLine", () => {
  it("treats absent percentages as zero", () => {
    const line = priceLine({ quantity: 10, unitPrice: 2 });
    assert.equal(line.discountPercent, 0);
    assert.equal(line.taxPercent, 0);
    assert.equal(line.subtotal, 20);
    assert.equal(line.discountAmount, 0);
    assert.equal(line.taxAmount, 0);
    assert.equal(line.total, 20);
  });
  it("discounts before taxing, which is the convention these documents use", () => {
    const line = priceLine({ quantity: 10, unitPrice: 12, discountPercent: 10, taxPercent: 20 });
    assert.equal(line.subtotal, 120);
    assert.equal(line.discountAmount, 12);
    assert.equal(line.taxAmount, 21.6);
    assert.equal(line.total, 129.6);
  });
  it("rounds to minor units to keep money arithmetic exact", () => {
    const line = priceLine({ quantity: 3, unitPrice: 3.33, discountPercent: 7.5 });
    assert.equal(line.discountAmount, 0.75);
    assert.equal(line.total, 9.24);
  });
  it("handles a full discount", () => {
    const line = priceLine({ quantity: 5, unitPrice: 10, discountPercent: 100 });
    assert.equal(line.discountAmount, 50);
    assert.equal(line.taxAmount, 0);
    assert.equal(line.total, 0);
  });
});
describe("sumLines", () => {
  it("adds up the components across lines", () => {
    const totals = sumLines([
      priceLine({ quantity: 2, unitPrice: 10 }),
      priceLine({ quantity: 3, unitPrice: 5, taxPercent: 10 })
    ]);
    assert.equal(totals.subtotal, 35);
    assert.equal(totals.discountAmount, 0);
    assert.equal(totals.taxAmount, 1.5);
    assert.equal(totals.total, 36.5);
  });
  it("returns zeroes for an empty document", () => {
    assert.deepEqual(sumLines([]), { subtotal: 0, discountAmount: 0, taxAmount: 0, total: 0 });
  });
  it("keeps the header total consistent with its own components", () => {
    const totals = sumLines([
      priceLine({ quantity: 3, unitPrice: 0.1 }),
      priceLine({ quantity: 3, unitPrice: 0.1 }),
      priceLine({ quantity: 3, unitPrice: 0.1 })
    ]);
    assert.equal(totals.total, round(totals.subtotal - totals.discountAmount + totals.taxAmount));
    assert.equal(totals.total, 0.9);
  });
});
describe("priceLines", () => {
  it("prices and totals in one pass", () => {
    const { priced, totals } = priceLines([
      { quantity: 1, unitPrice: 100 },
      { quantity: 2, unitPrice: 50, discountPercent: 10 }
    ]);
    assert.equal(priced.length, 2);
    assert.equal(priced[1].discountAmount, 10);
    assert.equal(totals.subtotal, 200);
    assert.equal(totals.discountAmount, 10);
    assert.equal(totals.total, 190);
  });
  it("preserves input order so line-level breakdowns line up with the request", () => {
    const { priced } = priceLines([
      { quantity: 1, unitPrice: 1 },
      { quantity: 1, unitPrice: 2 },
      { quantity: 1, unitPrice: 3 }
    ]);
    assert.deepEqual(priced.map((line) => line.unitPrice), [1, 2, 3]);
  });
});
const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
