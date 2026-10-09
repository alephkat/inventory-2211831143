import assert from "node:assert/strict";
import { describe, it } from "node:test";
const loadApp = async () => {
  const { createApp } = await import("../../src/app.js");
  return createApp();
};
const mountPrefix = (layer) => {
  const source = layer?.regexp?.source ?? "";
  const match = source.match(/\^\\\/((?:[\w-]+\\\/)*[\w-]+)/);
  return match ? `/${match[1].replace(/\\\//g, "")}` : "";
};
const collect = (stack, prefix = "") => {
  if (!Array.isArray(stack)) return [];
  return stack.flatMap((layer) => {
    if (layer?.route) {
      return Object.keys(layer.route.methods ?? {}).map(
        (method) => `${method.toUpperCase()} ${prefix}${layer.route.path}`
      );
    }
    if (layer?.name === "router" && Array.isArray(layer.handle?.stack)) {
      const inner = mountPrefix(layer) || prefix;
      return collect(layer.handle.stack, inner);
    }
    return [];
  });
};
const stackOf = (router) => {
  const internal = router?._router;
  if (internal && Array.isArray(internal.stack)) return internal.stack;
  if (Array.isArray(router?.stack)) return router.stack;
  return [];
};
describe("application wiring", () => {
  it("builds the Express app without throwing", async () => {
    const app = await loadApp();
    assert.equal(typeof app, "function");
  });
  it("registers the health endpoint", async () => {
    const app = await loadApp();
    const paths = collect(stackOf(app));
    assert.ok(
      paths.some((p) => p.endsWith(" /health")),
      `expected a /health route, found: ${paths.join(", ") || "(none)"}`
    );
  });
});
describe("workflow routes are mounted", () => {
  it("exposes an endpoint for every workflow in the router table", async () => {
    const { registerRoutes } = await import("../../src/routes/index.js");
    const paths = collect(stackOf(registerRoutes));
    const expectedPrefixes = [
      "/receipts",
      "/issues",
      "/transfers",
      "/adjustments",
      "/counts",
      "/purchase-orders",
      "/suppliers",
      "/notifications"
    ];
    assert.ok(paths.length > 0, "no routes were discovered; the collector is broken");
    for (const prefix of expectedPrefixes) {
      assert.ok(
        paths.some((p) => p.includes(prefix)),
        `no route is mounted for ${prefix}`
      );
    }
  });
  it("exposes the lifecycle actions of the counting workflow", async () => {
    const { registerRoutes } = await import("../../src/routes/index.js");
    const paths = collect(stackOf(registerRoutes)).filter((p) => p.includes("/counts"));
    for (const action of ["/start", "/items", "/complete", "/review", "/approve", "/post"]) {
      assert.ok(
        paths.some((p) => p.includes(action)),
        `counting workflow is missing the ${action} endpoint`
      );
    }
  });
  it("exposes the full dispatch-to-confirm transfer lifecycle", async () => {
    const { registerRoutes } = await import("../../src/routes/index.js");
    const paths = collect(stackOf(registerRoutes)).filter((p) => p.includes("/transfers"));
    for (const action of ["/approve", "/dispatch", "/in-transit", "/receive", "/confirm", "/reject", "/cancel"]) {
      assert.ok(
        paths.some((p) => p.includes(action)),
        `transfer workflow is missing the ${action} endpoint`
      );
    }
  });
});
