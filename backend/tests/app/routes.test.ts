import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * Application wiring smoke test.
 *
 * `shared/workflow/index.ts` re-exports the runtime, which imports the
 * notification service, which the modules import in turn. That shape is a
 * plausible source of circular-import bugs that neither `tsc` nor a unit test
 * of a single module would catch, because the cycle only resolves when the
 * whole graph is loaded in one go. Mounting the real Express app is the
 * cheapest way to prove the graph is sound and the routes are reachable.
 */

const loadApp = async () => {
  const { createApp } = await import('../../src/app');
  return createApp();
};

/**
 * Flatten an Express 4 router stack into `METHOD /path` strings.
 *
 * Express 4 does not expose a mounted router's path as data, only as a
 * regexp on the layer. Rather than reconstructing it precisely, the prefix is
 * recovered by reading the literal segments out of the regexp source, which
 * is enough for the substring assertions below and far less brittle than
 * trying to reproduce Express's internal pattern.
 */
const mountPrefix = (layer: any): string => {
  const source: string = layer?.regexp?.source ?? '';
  const match = source.match(/\^\\\/((?:[\w-]+\\\/)*[\w-]+)/);
  return match ? `/${match[1].replace(/\\\//g, '')}` : '';
};

const collect = (stack: any[], prefix = ''): string[] => {
  if (!Array.isArray(stack)) return [];

  return stack.flatMap((layer: any) => {
    if (layer?.route) {
      return Object.keys(layer.route.methods ?? {}).map(
        (method) => `${method.toUpperCase()} ${prefix}${layer.route.path}`,
      );
    }
    if (layer?.name === 'router' && Array.isArray(layer.handle?.stack)) {
      const inner = mountPrefix(layer) || prefix;
      return collect(layer.handle.stack, inner);
    }
    return [];
  });
};

/**
 * The router stack, regardless of Express 4/5 internals.
 *
 * `app.router` is a deprecated getter in Express 4 that *throws* when read,
 * so the internal `_router` is preferred and the public `stack` is only used
 * for plain `Router()` instances, where it is an ordinary own property.
 */
const stackOf = (router: any): any[] => {
  const internal = router?._router;
  if (internal && Array.isArray(internal.stack)) return internal.stack;
  if (Array.isArray(router?.stack)) return router.stack;
  return [];
};

describe('application wiring', () => {
  it('builds the Express app without throwing', async () => {
    const app = await loadApp();
    assert.equal(typeof app, 'function');
  });

  it('registers the health endpoint', async () => {
    const app = await loadApp();
    const paths = collect(stackOf(app));
    assert.ok(
      paths.some((p) => p.endsWith(' /health')),
      `expected a /health route, found: ${paths.join(', ') || '(none)'}`,
    );
  });
});

describe('workflow routes are mounted', () => {
  it('exposes an endpoint for every workflow in the router table', async () => {
    const { registerRoutes } = await import('../../src/routes');
    const paths = collect(stackOf(registerRoutes));

    // The bug this guards: `stock-receipts` existed as a module but was never
    // mounted, so the whole receiving workflow was unreachable over HTTP.
    const expectedPrefixes = [
      '/receipts', '/issues', '/transfers', '/adjustments',
      '/counts', '/purchase-orders', '/suppliers', '/notifications',
    ];

    assert.ok(paths.length > 0, 'no routes were discovered; the collector is broken');
    for (const prefix of expectedPrefixes) {
      assert.ok(
        paths.some((p) => p.includes(prefix)),
        `no route is mounted for ${prefix}`,
      );
    }
  });

  it('exposes the lifecycle actions of the counting workflow', async () => {
    const { registerRoutes } = await import('../../src/routes');
    const paths = collect(stackOf(registerRoutes)).filter((p) => p.includes('/counts'));

    for (const action of ['/start', '/items', '/complete', '/review', '/approve', '/post']) {
      assert.ok(
        paths.some((p) => p.includes(action)),
        `counting workflow is missing the ${action} endpoint`,
      );
    }
  });

  it('exposes the full dispatch-to-confirm transfer lifecycle', async () => {
    const { registerRoutes } = await import('../../src/routes');
    const paths = collect(stackOf(registerRoutes)).filter((p) => p.includes('/transfers'));

    for (const action of ['/approve', '/dispatch', '/in-transit', '/receive', '/confirm', '/reject', '/cancel']) {
      assert.ok(
        paths.some((p) => p.includes(action)),
        `transfer workflow is missing the ${action} endpoint`,
      );
    }
  });
});
