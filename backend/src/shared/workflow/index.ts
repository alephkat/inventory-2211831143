/**
 * Shared inventory workflow engine.
 *
 * `state-machine` and `workflows` are pure and dependency-free so the legal
 * moves of every workflow can be asserted in unit tests without a database.
 * `runtime` wires those tables to Prisma, the audit trail and notifications.
 */
export * from './state-machine';
export * from './workflows';
export * from './guards';
export * from './pricing';
export * from './events';
export * from './runtime';
export * from './stock';
