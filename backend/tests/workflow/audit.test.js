import assert from "node:assert/strict";
import { describe, it } from "node:test";
const makeClient = (options = {}) => {
  const rows = [];
  return {
    rows,
    client: {
      user: {
        findUnique: async () => {
          if (options.user === "throws") throw new Error("user lookup failed");
          return options.user ?? null;
        }
      },
      auditLog: {
        create: async ({ data }) => {
          if (options.createThrows) throw new Error("audit insert failed");
          rows.push({ data });
          return data;
        }
      }
    }
  };
};
const loadAuditModule = async () => {
  const { createAuditLog } = await import("../../src/shared/utils/audit.js");
  return createAuditLog;
};
describe("createAuditLog", () => {
  it("persists the action, resource and both value snapshots", async () => {
    const createAuditLog = await loadAuditModule();
    const { client, rows } = makeClient({ user: { fullName: "Dana Okafor", username: "dana" } });
    await createAuditLog({
      userId: "u-1",
      action: "APPROVE",
      resourceType: "stock_receipt",
      resourceId: "r-1",
      oldValues: { status: "PENDING" },
      newValues: { status: "APPROVED" },
      client
    });
    assert.equal(rows.length, 1);
    const row = rows[0].data;
    assert.equal(row.action, "APPROVE");
    assert.equal(row.resourceType, "stock_receipt");
    assert.equal(row.resourceId, "r-1");
    assert.equal(row.userId, "u-1");
    assert.deepEqual(row.oldValues, { status: "PENDING" });
    assert.deepEqual(row.newValues, { status: "APPROVED" });
  });
  it("records the acting user by full name for the audit trail", async () => {
    const createAuditLog = await loadAuditModule();
    const { client, rows } = makeClient({ user: { fullName: "Dana Okafor", username: "dana" } });
    await createAuditLog({
      userId: "u-1",
      action: "CREATE",
      resourceType: "stock_count",
      resourceId: "c-1",
      client
    });
    assert.equal(rows[0].data.userName, "Dana Okafor");
  });
  it("falls back to the username when no full name is set", async () => {
    const createAuditLog = await loadAuditModule();
    const { client, rows } = makeClient({ user: { fullName: "", username: "svc-import" } });
    await createAuditLog({ userId: "u-1", action: "CREATE", resourceType: "role", resourceId: "r-1", client });
    assert.equal(rows[0].data.userName, "svc-import");
  });
  it("falls back to the user id when the user record is gone", async () => {
    const createAuditLog = await loadAuditModule();
    const { client, rows } = makeClient({ user: null });
    await createAuditLog({ userId: "u-deleted", action: "CREATE", resourceType: "role", resourceId: "r-1", client });
    assert.equal(rows[0].data.userName, "u-deleted");
  });
  it("omits the value snapshots entirely when none were supplied", async () => {
    const createAuditLog = await loadAuditModule();
    const { client, rows } = makeClient();
    await createAuditLog({ userId: "u-1", action: "DELETE", resourceType: "role", resourceId: "r-1", client });
    assert.equal(rows[0].data.oldValues, void 0);
    assert.equal(rows[0].data.newValues, void 0);
  });
  it("never throws when the audit insert fails", async () => {
    const createAuditLog = await loadAuditModule();
    const { client } = makeClient({ createThrows: true });
    await assert.doesNotReject(
      () => createAuditLog({ userId: "u-1", action: "APPROVE", resourceType: "stock_receipt", resourceId: "r-1", client })
    );
  });
  it("never throws when the user lookup fails", async () => {
    const createAuditLog = await loadAuditModule();
    const { client, rows } = makeClient({ user: "throws" });
    await assert.doesNotReject(
      () => createAuditLog({ userId: "u-1", action: "APPROVE", resourceType: "stock_receipt", resourceId: "r-1", client })
    );
    assert.equal(rows.length, 0);
  });
  it("carries the request ip and user agent through when supplied", async () => {
    const createAuditLog = await loadAuditModule();
    const { client, rows } = makeClient();
    await createAuditLog({
      userId: "u-1",
      action: "LOGIN",
      resourceType: "user",
      resourceId: "u-1",
      ipAddress: "203.0.113.9",
      userAgent: "Mozilla/5.0",
      client
    });
    assert.equal(rows[0].data.ipAddress, "203.0.113.9");
    assert.equal(rows[0].data.userAgent, "Mozilla/5.0");
  });
});
