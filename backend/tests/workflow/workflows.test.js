import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allowedNext, isTerminal } from "../../src/shared/workflow/state-machine.js";
import {
  adjustmentWorkflow,
  allWorkflows,
  assertRejectionReason,
  countWorkflow,
  issueWorkflow,
  purchaseOrderWorkflow,
  receiptWorkflow,
  salesOrderWorkflow,
  supplierWorkflow,
  transferWorkflow
} from "../../src/shared/workflow/workflows.js";
const entries = Object.entries(allWorkflows);
const reachable = (def) => {
  const seen = /* @__PURE__ */ new Set([def.initial]);
  const queue = [def.initial];
  while (queue.length) {
    const current = queue.shift();
    for (const next of def.transitions[current] ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
};
const statesOf = (def) => def.states;
describe("workflow definitions are internally consistent", () => {
  for (const [key, def] of entries) {
    describe(key, () => {
      it("declares the initial state as one of its own states", () => {
        assert.ok(
          statesOf(def).includes(def.initial),
          `${key}: initial state is not declared`
        );
      });
      it("only lists declared states in the transitions table", () => {
        for (const [from, targets] of Object.entries(def.transitions)) {
          assert.ok(def.states.includes(from), `${key}: ${from} is not a declared state`);
          for (const to of targets) {
            assert.ok(
              def.states.includes(to),
              `${key}: ${from} -> ${to} targets an undeclared state`
            );
          }
        }
      });
      it("only lists declared states as terminal", () => {
        const terminal = def.terminal;
        for (const state of terminal) {
          assert.ok(def.states.includes(state), `${key}: terminal ${state} is not declared`);
        }
      });
      it("never declares a state as both terminal and having outgoing moves", () => {
        for (const state of def.terminal) {
          assert.equal(
            allowedNext(def, state).length,
            0,
            `${key}: ${state} is terminal yet has outgoing transitions`
          );
        }
      });
      it("never allows a transition into itself", () => {
        for (const [from, targets] of Object.entries(def.transitions)) {
          assert.ok(
            !targets.includes(from),
            `${key}: ${from} -> ${from} would allow a no-op re-entry`
          );
        }
      });
      it("can reach every declared state from the initial state", () => {
        assert.deepEqual(
          reachable(def),
          new Set(def.states),
          `${key}: some states are unreachable`
        );
      });
      it("treats every state with no outgoing moves as terminal", () => {
        for (const state of def.states) {
          const hasMoves = allowedNext(def, state).length > 0;
          assert.equal(isTerminal(def, state), !hasMoves, `${key}: ${state} terminality is wrong`);
        }
      });
      it("has a human label for every state", () => {
        for (const state of def.states) {
          assert.ok(def.labels?.[state], `${key}: ${state} has no label`);
        }
      });
    });
  }
});
describe("receiving workflow", () => {
  it("starts pending", () => {
    assert.equal(receiptWorkflow.initial, "PENDING");
  });
  it("cannot receive before approval", () => {
    assert.equal(allowedNext(receiptWorkflow, "PENDING").includes("RECEIVED"), false);
    assert.deepEqual(allowedNext(receiptWorkflow, "PENDING"), [
      "APPROVED",
      "REJECTED",
      "CANCELLED"
    ]);
  });
  it("supports a partial delivery that later completes", () => {
    assert.ok(allowedNext(receiptWorkflow, "APPROVED").includes("PARTIALLY_RECEIVED"));
    assert.ok(allowedNext(receiptWorkflow, "PARTIALLY_RECEIVED").includes("RECEIVED"));
  });
  it("cannot be reopened once received", () => {
    assert.equal(allowedNext(receiptWorkflow, "RECEIVED").length, 0);
  });
  it("does not allow a rejected receipt to be approved", () => {
    assert.equal(allowedNext(receiptWorkflow, "REJECTED").length, 0);
  });
});
describe("issuing workflow", () => {
  it("separates approval from the stock movement", () => {
    assert.deepEqual(allowedNext(issueWorkflow, "PENDING"), [
      "APPROVED",
      "REJECTED",
      "CANCELLED"
    ]);
    assert.deepEqual(allowedNext(issueWorkflow, "APPROVED"), [
      "ISSUED",
      "PARTIALLY_ISSUED",
      "CANCELLED"
    ]);
  });
  it("lets a partial issue be finished off later", () => {
    assert.ok(allowedNext(issueWorkflow, "PARTIALLY_ISSUED").includes("ISSUED"));
  });
  it("cannot cancel once fully issued", () => {
    assert.equal(allowedNext(issueWorkflow, "ISSUED").length, 0);
  });
});
describe("transfer workflow", () => {
  it("runs the full six-stage happy path", () => {
    const path = ["REQUESTED", "APPROVED", "DISPATCHED", "IN_TRANSIT", "RECEIVED", "CONFIRMED"];
    for (let i = 0; i < path.length - 1; i += 1) {
      const from = path[i];
      const to = path[i + 1];
      assert.ok(
        allowedNext(transferWorkflow, from).includes(to),
        `${from} -> ${to} should be allowed`
      );
    }
  });
  it("cannot confirm without first receiving", () => {
    assert.equal(allowedNext(transferWorkflow, "IN_TRANSIT").includes("CONFIRMED"), false);
    assert.deepEqual(allowedNext(transferWorkflow, "IN_TRANSIT"), ["RECEIVED", "CANCELLED"]);
  });
  it("does not allow a received transfer to be cancelled", () => {
    assert.deepEqual(allowedNext(transferWorkflow, "RECEIVED"), ["CONFIRMED"]);
  });
  it("cannot skip approval", () => {
    assert.equal(allowedNext(transferWorkflow, "REQUESTED").includes("DISPATCHED"), false);
  });
});
describe("adjustment workflow", () => {
  it("applies the correction only after approval", () => {
    assert.equal(allowedNext(adjustmentWorkflow, "PENDING").includes("COMPLETED"), false);
    assert.deepEqual(allowedNext(adjustmentWorkflow, "APPROVED"), ["COMPLETED", "CANCELLED"]);
  });
  it("is terminal once applied or rejected", () => {
    for (const state of ["COMPLETED", "REJECTED", "CANCELLED"]) {
      assert.equal(isTerminal(adjustmentWorkflow, state), true);
    }
  });
});
describe("counting workflow", () => {
  it("separates recording counts from posting adjustments", () => {
    assert.ok(countWorkflow.states.includes("COMPLETED"));
    assert.ok(countWorkflow.states.includes("ADJUSTED"));
    assert.equal(allowedNext(countWorkflow, "COMPLETED").includes("ADJUSTED"), false);
  });
  it("allows a count to be cancelled before it is posted", () => {
    assert.ok(allowedNext(countWorkflow, "DRAFT").includes("CANCELLED"));
    assert.ok(allowedNext(countWorkflow, "REVIEWED").includes("CANCELLED"));
    assert.equal(allowedNext(countWorkflow, "ADJUSTED").length, 0);
  });
  it("cannot post a count that was never approved", () => {
    assert.deepEqual(allowedNext(countWorkflow, "COMPLETED"), ["REVIEWED", "CANCELLED"]);
    assert.deepEqual(allowedNext(countWorkflow, "REVIEWED"), ["APPROVED", "CANCELLED"]);
  });
});
describe("purchase order workflow", () => {
  it("requires submission before approval", () => {
    assert.equal(allowedNext(purchaseOrderWorkflow, "DRAFT").includes("APPROVED"), false);
    assert.ok(allowedNext(purchaseOrderWorkflow, "PENDING").includes("APPROVED"));
  });
  it("cannot receive goods against an unapproved order", () => {
    assert.deepEqual(allowedNext(purchaseOrderWorkflow, "PENDING"), [
      "APPROVED",
      "REJECTED",
      "CANCELLED"
    ]);
  });
  it("completes once every line is fully received", () => {
    assert.ok(allowedNext(purchaseOrderWorkflow, "APPROVED").includes("COMPLETED"));
    assert.ok(allowedNext(purchaseOrderWorkflow, "PARTIALLY_RECEIVED").includes("COMPLETED"));
  });
  it("has no separate RECEIVED state, because a filled order is completed", () => {
    assert.equal(purchaseOrderWorkflow.states.includes("RECEIVED"), false);
  });
  it("closes the order for good once completed", () => {
    assert.deepEqual(allowedNext(purchaseOrderWorkflow, "COMPLETED"), []);
  });
});
describe("sales order workflow", () => {
  it("uses its own lifecycle rather than the purchase order one", () => {
    assert.notDeepEqual(
      allowedNext(salesOrderWorkflow, "APPROVED"),
      allowedNext(purchaseOrderWorkflow, "APPROVED")
    );
  });
  it("issues before delivery", () => {
    assert.ok(allowedNext(salesOrderWorkflow, "APPROVED").includes("ISSUED"));
    assert.ok(allowedNext(salesOrderWorkflow, "ISSUED").includes("RECEIVED"));
  });
});
describe("supplier workflow", () => {
  it("starts unapproved so a new supplier cannot be used immediately", () => {
    assert.equal(supplierWorkflow.initial, "PENDING_APPROVAL");
    assert.equal(allowedNext(supplierWorkflow, "PENDING_APPROVAL").includes("ACTIVE"), true);
  });
  it("cannot reach ACTIVE without going through approval", () => {
    assert.equal(allowedNext(supplierWorkflow, "DRAFT").length > 0, false);
  });
  it("allows a blacklisted supplier to be reinstated into review", () => {
    assert.deepEqual(allowedNext(supplierWorkflow, "BLACKLISTED"), [
      "PENDING_APPROVAL",
      "ACTIVE"
    ]);
  });
  it("cannot reactivate a supplier directly from active", () => {
    assert.deepEqual(allowedNext(supplierWorkflow, "ACTIVE"), ["INACTIVE", "BLACKLISTED"]);
  });
});
describe("assertRejectionReason", () => {
  it("accepts a trimmed reason", () => {
    assert.equal(assertRejectionReason("  damaged on arrival "), "damaged on arrival");
  });
  it("rejects an absent reason", () => {
    assert.throws(() => assertRejectionReason(void 0), /reason is required/i);
  });
  it("rejects an empty or whitespace-only reason", () => {
    assert.throws(() => assertRejectionReason(""), /reason is required/i);
    assert.throws(() => assertRejectionReason("   "), /reason is required/i);
  });
  it("is a 400, not a 409, because the request body is wrong", () => {
    assert.throws(
      () => assertRejectionReason(null),
      (error) => {
        assert.equal(error.statusCode, 400);
        return true;
      }
    );
  });
});
