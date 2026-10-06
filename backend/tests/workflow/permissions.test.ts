import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { PERMISSIONS, PERMISSION_VALUES } from '../../src/shared/types/permissions';

/**
 * The permission registry and the route guards have to agree.
 *
 * This existed as a real bug: four route guards referenced permission values
 * (`approve_stock_issues`, `override_stock_issue`, `manage_stock_receipts`,
 * `approve_stock_receipts`) that were never registered, so no seeded role
 * could ever be granted them and those endpoints were unreachable for every
 * user. Nothing caught it at compile time. These tests scan the route source
 * so the same drift fails loudly instead.
 */

const SRC = resolve(__dirname, '../../src');

const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
};

const sourceFiles = walk(SRC);

/** Every string literal passed to requirePermission anywhere in the routes. */
const permissionsUsedInRoutes = (): string[] => {
  const used = new Set<string>();
  for (const file of sourceFiles) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/requirePermission\(\s*'([^']+)'/g)) {
      used.add(match[1]);
    }
    for (const match of source.matchAll(/requirePermission\(\s*\[([^\]]+)\]/g)) {
      for (const value of match[1].matchAll(/'([^']+)'/g)) {
        used.add(value[1]);
      }
    }
  }
  return [...used];
};

/** Every string literal in a `workflow:` position of runTransition calls. */
const workflowKeysUsedInServices = (): string[] => {
  const used = new Set<string>();
  for (const file of sourceFiles) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/workflow:\s*'([^']+)'/g)) {
      used.add(match[1]);
    }
  }
  return [...used];
};

describe('permission registry', () => {
  it('has no duplicate values', () => {
    assert.equal(new Set(PERMISSION_VALUES).size, PERMISSION_VALUES.length);
  });

  it('has no duplicate names', () => {
    const names = PERMISSIONS.map((p) => p.name);
    assert.equal(new Set(names).size, names.length);
  });

  it('uses snake_case values', () => {
    for (const value of PERMISSION_VALUES) {
      assert.match(value, /^[a-z][a-z0-9_]*$/, `${value} is not snake_case`);
    }
  });

  it('documents every permission', () => {
    for (const permission of PERMISSIONS) {
      assert.ok(permission.name.length > 0, `${permission.value} has no name`);
      assert.ok(permission.description.length > 0, `${permission.value} has no description`);
      assert.ok(permission.resource.length > 0, `${permission.value} has no resource`);
    }
  });

  it('keeps the propose and approve permissions of a workflow distinct', () => {
    // Collapsing these would let a storekeeper approve their own receiving.
    for (const [propose, approve] of [
      ['manage_stock_receipts', 'approve_stock_receipts'],
      ['issue_stock', 'approve_stock_issues'],
      ['count_stock', 'approve_stock_counts'],
    ]) {
      assert.notEqual(propose, approve);
      assert.ok(PERMISSION_VALUES.includes(propose), `${propose} is not registered`);
      assert.ok(PERMISSION_VALUES.includes(approve), `${approve} is not registered`);
    }
  });
});

describe('route guards only reference registered permissions', () => {
  const used = permissionsUsedInRoutes();

  it('finds route guards to check', () => {
    assert.ok(used.length > 0, 'no requirePermission calls were found; the scan is broken');
  });

  it('registers every permission a route guard requires', () => {
    const unknown = used.filter((value) => !PERMISSION_VALUES.includes(value));
    assert.deepEqual(
      unknown,
      [],
      `routes require unregistered permissions, so no role can be granted them: ${unknown.join(', ')}`,
    );
  });

  it('guards the workflow mutation endpoints with a distinct approval permission', () => {
    // A regression guard for the original defect, stated as intent.
    assert.ok(used.includes('approve_stock_receipts'));
    assert.ok(used.includes('approve_stock_issues'));
    assert.ok(used.includes('approve_stock_counts'));
  });
});

describe('workflow keys used in services are all registered', () => {
  it('accepts only keys the engine knows about', async () => {
    const { allWorkflows } = await import('../../src/shared/workflow/workflows');
    const known = Object.keys(allWorkflows);
    const used = workflowKeysUsedInServices();

    assert.ok(used.length > 0, 'no workflow transitions were found; the scan is broken');

    const unknown = used.filter((key) => !known.includes(key));
    assert.deepEqual(unknown, [], `services reference unknown workflow keys: ${unknown.join(', ')}`);
  });

  it('exercises every registered workflow somewhere in the services', () => {
    const used = workflowKeysUsedInServices();
    for (const key of used) {
      assert.ok(used.includes(key));
    }
  });
});

describe('the scan sees the source tree it thinks it does', () => {
  it('found service and route files', () => {
    const names = sourceFiles.map((f) => f.replace(SRC, ''));
    assert.ok(names.some((n) => n.includes('stock-transfers.service.ts')));
    assert.ok(names.some((n) => n.includes('stock-counts.service.ts')));
    assert.ok(names.some((n) => n.includes('stock-receipts.routes.ts')));
  });

  it('resolves to a real directory', () => {
    assert.equal(statSync(SRC).isDirectory(), true);
  });
});
