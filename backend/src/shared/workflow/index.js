/**
 * Shared inventory workflow engine.
 *
 * `state-machine` and `workflows` are pure and dependency-free so the legal
 * moves of every workflow can be asserted in unit tests without a database.
 * `runtime` wires those tables to Prisma, the audit trail and notifications.
 */
export * from './state-machine.js';
export * from './workflows.js';
export * from './guards.js';
export * from './pricing.js';
export * from './events.js';
export * from './runtime.js';
export * from './stock.js';
