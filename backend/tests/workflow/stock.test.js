import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyStockMovements } from "../../src/shared/workflow/stock.js";
const makeTx = (seed = {}) => {
  const products = new Map(
    (seed.products ?? [{ id: "p1", costPrice: 10 }]).map((p) => [p.id, p])
  );
  const inventory = /* @__PURE__ */ new Map();
  for (const row of seed.inventory ?? []) {
    inventory.set(`${row.productId}:${row.warehouseId}`, { ...row });
  }
  const ledger = [];
  let nextLedgerId = 1;
  const key = (productId, warehouseId) => `${productId}:${warehouseId}`;
  const tx = {
    product: {
      findUnique: async ({ where }) => {
        const product = products.get(where.id);
        if (!product) return null;
        return { id: product.id, name: product.name ?? product.id, unit: "PIECE", costPrice: product.costPrice };
      }
    },
    inventory: {
      findUnique: async ({ where }) => {
        return inventory.get(key(where.productId_warehouseId.productId, where.productId_warehouseId.warehouseId)) ?? null;
      },
      upsert: async ({ where, update, create }) => {
        const k = key(where.productId_warehouseId.productId, where.productId_warehouseId.warehouseId);
        const existing = inventory.get(k);
        if (existing) {
          existing.currentQuantity += update.currentQuantity.increment;
          existing.availableQuantity += update.availableQuantity.increment;
          existing.stockValue += update.stockValue.increment;
          return { ...existing };
        }
        const created = {
          productId: where.productId_warehouseId.productId,
          warehouseId: where.productId_warehouseId.warehouseId,
          currentQuantity: create.currentQuantity,
          availableQuantity: create.availableQuantity,
          stockValue: create.stockValue
        };
        inventory.set(k, created);
        return { ...created };
      }
    },
    inventoryTransaction: {
      create: async ({ data }) => {
        const row = {
          id: `tx-${nextLedgerId++}`,
          productId: data.productId,
          quantity: data.quantity,
          previousQuantity: data.previousQuantity,
          newQuantity: data.newQuantity,
          type: data.type
        };
        ledger.push(row);
        return row;
      }
    }
  };
  return { tx, inventory, ledger, products };
};
const movement = (over = {}) => ({
  productId: "p1",
  warehouseId: "w1",
  quantity: 5,
  direction: "IN",
  reason: "test",
  performedById: "u1",
  ...over
});
const balanceOf = (store, productId, warehouseId) => store.inventory.get(`${productId}:${warehouseId}`);
describe("applyStockMovements: inbound", () => {
  it("creates the balance row when the product was not previously stocked", async () => {
    const store = makeTx();
    await applyStockMovements(store.tx, [movement()]);
    const balance = balanceOf(store, "p1", "w1");
    assert.equal(balance?.currentQuantity, 5);
    assert.equal(balance?.availableQuantity, 5);
  });
  it("adds to an existing balance", async () => {
    const store = makeTx({
      inventory: [{ productId: "p1", warehouseId: "w1", currentQuantity: 10, availableQuantity: 10, stockValue: 100 }]
    });
    await applyStockMovements(store.tx, [movement({ quantity: 3 })]);
    assert.equal(balanceOf(store, "p1", "w1")?.currentQuantity, 13);
  });
  it("records the opening and closing quantities on the ledger row", async () => {
    const store = makeTx({
      inventory: [{ productId: "p1", warehouseId: "w1", currentQuantity: 10, availableQuantity: 10, stockValue: 100 }]
    });
    const applied = await applyStockMovements(store.tx, [movement({ quantity: 3 })]);
    assert.equal(applied[0].previousQuantity, 10);
    assert.equal(applied[0].newQuantity, 13);
    assert.equal(store.ledger[0].previousQuantity, 10);
    assert.equal(store.ledger[0].newQuantity, 13);
  });
  it("defaults the ledger type to RECEIVED and keeps the quantity positive", async () => {
    const store = makeTx();
    await applyStockMovements(store.tx, [movement({ quantity: 4 })]);
    assert.equal(store.ledger[0].type, "RECEIVED");
    assert.equal(store.ledger[0].quantity, 4);
  });
  it("values the stock at the product cost", async () => {
    const store = makeTx({ products: [{ id: "p1", costPrice: 2.5 }] });
    await applyStockMovements(store.tx, [movement({ quantity: 4 })]);
    assert.equal(balanceOf(store, "p1", "w1")?.stockValue, 10);
  });
});
describe("applyStockMovements: outbound", () => {
  const stocked = () => makeTx({
    inventory: [{ productId: "p1", warehouseId: "w1", currentQuantity: 10, availableQuantity: 10, stockValue: 100 }]
  });
  it("removes from the balance", async () => {
    const store = stocked();
    await applyStockMovements(store.tx, [movement({ direction: "OUT", quantity: 4 })]);
    assert.equal(balanceOf(store, "p1", "w1")?.currentQuantity, 6);
    assert.equal(balanceOf(store, "p1", "w1")?.availableQuantity, 6);
  });
  it("records the balance before and after the issue", async () => {
    const store = stocked();
    const applied = await applyStockMovements(store.tx, [movement({ direction: "OUT", quantity: 4 })]);
    assert.equal(applied[0].previousQuantity, 10);
    assert.equal(applied[0].newQuantity, 6);
  });
  it("defaults the ledger type to ISSUED and stores a positive magnitude", async () => {
    const store = stocked();
    await applyStockMovements(store.tx, [movement({ direction: "OUT", quantity: 4 })]);
    assert.equal(store.ledger[0].type, "ISSUED");
    assert.equal(store.ledger[0].quantity, 4);
  });
  it("reduces the stock value so it does not drift upward forever", async () => {
    const store = stocked();
    await applyStockMovements(store.tx, [movement({ direction: "OUT", quantity: 10 })]);
    assert.equal(balanceOf(store, "p1", "w1")?.stockValue, 0);
  });
  it("allows issuing the entire balance", async () => {
    const store = stocked();
    await assert.doesNotReject(
      () => applyStockMovements(store.tx, [movement({ direction: "OUT", quantity: 10 })])
    );
    assert.equal(balanceOf(store, "p1", "w1")?.currentQuantity, 0);
  });
  it("refuses to issue more than is available", async () => {
    const store = stocked();
    await assert.rejects(() => applyStockMovements(store.tx, [movement({ direction: "OUT", quantity: 11 })]), /only 10 is available/);
  });
  it("writes no ledger row when the issue is refused", async () => {
    const store = stocked();
    await assert.rejects(() => applyStockMovements(store.tx, [movement({ direction: "OUT", quantity: 11 })]));
    assert.equal(store.ledger.length, 0);
  });
  it("leaves the balance untouched when the issue is refused", async () => {
    const store = stocked();
    await assert.rejects(() => applyStockMovements(store.tx, [movement({ direction: "OUT", quantity: 11 })]));
    assert.equal(balanceOf(store, "p1", "w1")?.currentQuantity, 10);
  });
  it("refuses to create a balance row for an outbound movement flagged as existing-only", async () => {
    const store = makeTx();
    await assert.rejects(
      () => applyStockMovements(store.tx, [movement({ direction: "OUT", requireExisting: true })]),
      /No stock record exists/
    );
  });
});
describe("applyStockMovements: validation", () => {
  it("rejects a zero or negative quantity", async () => {
    const store = makeTx();
    await assert.rejects(() => applyStockMovements(store.tx, [movement({ quantity: 0 })]), /greater than zero/);
    await assert.rejects(() => applyStockMovements(store.tx, [movement({ quantity: -1 })]), /greater than zero/);
  });
  it("rejects an unknown product", async () => {
    const store = makeTx();
    await assert.rejects(
      () => applyStockMovements(store.tx, [movement({ productId: "nope" })]),
      /Invalid product/
    );
  });
  it("stores a zero quantity on an empty document without doing anything", async () => {
    const store = makeTx();
    assert.deepEqual(await applyStockMovements(store.tx, []), []);
    assert.equal(store.ledger.length, 0);
  });
});
describe("applyStockMovements: ledger and balance agree", () => {
  it("holds across a receipt, an issue and a transfer", async () => {
    const store = makeTx({
      products: [
        { id: "p1", costPrice: 10 },
        { id: "p2", costPrice: 4 }
      ],
      inventory: [
        { productId: "p1", warehouseId: "w1", currentQuantity: 100, availableQuantity: 100, stockValue: 1e3 },
        { productId: "p1", warehouseId: "w2", currentQuantity: 0, availableQuantity: 0, stockValue: 0 }
      ]
    });
    await applyStockMovements(store.tx, [
      movement({ productId: "p1", warehouseId: "w1", quantity: 20, direction: "IN" }),
      movement({ productId: "p1", warehouseId: "w1", quantity: 30, direction: "OUT" }),
      movement({ productId: "p1", warehouseId: "w2", quantity: 30, direction: "IN" }),
      movement({ productId: "p2", warehouseId: "w1", quantity: 7, direction: "IN" })
    ]);
    assert.equal(balanceOf(store, "p1", "w1")?.currentQuantity, 90);
    assert.equal(balanceOf(store, "p1", "w2")?.currentQuantity, 30);
    assert.equal(balanceOf(store, "p2", "w1")?.currentQuantity, 7);
    const sourceRows = store.ledger.filter((row) => row.productId === "p1" && true);
    assert.equal(sourceRows[0].previousQuantity, 100);
    assert.equal(sourceRows[0].newQuantity, 120);
    assert.equal(sourceRows[1].previousQuantity, 120);
    assert.equal(sourceRows[1].newQuantity, 90);
    const totalAcrossWarehouses = (balanceOf(store, "p1", "w1")?.currentQuantity ?? 0) + (balanceOf(store, "p1", "w2")?.currentQuantity ?? 0);
    assert.equal(totalAcrossWarehouses, 120);
  });
  it("writes exactly one ledger row per movement", async () => {
    const store = makeTx();
    await applyStockMovements(store.tx, [
      movement({ productId: "p1", quantity: 1 }),
      movement({ productId: "p1", quantity: 2 })
    ]);
    assert.equal(store.ledger.length, 2);
  });
});
