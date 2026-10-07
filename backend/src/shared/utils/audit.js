import { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';

/**
 * Append a record to the audit trail. Called from services whenever a
 * domain mutation occurs so every change is traceable.
 */

/**
 * Prisma's JSON input types reject `Record<string, unknown>` because `unknown`
 * is not assignable to `JsonValue`. Narrowing here keeps the JSON contract
 * intact while letting callers pass plain objects.
 */
const toJson = (value | null | undefined) =>
 (value ?? undefined) .InputJsonValue | undefined;

export const createAuditLog = async (input) => {
 const db = input.client ?? prisma;
 try {
 const user = await db.user.findUnique({
 where,
 select,
 });
 await db.auditLog.create({
 data,
 });
 } catch {
 // Audit logging must never break the core operation. A dropped audit row
 // is a problem worth alerting on, but failing the stock movement that
 // already succeeded is worse: it would leave the database in a state the
 // caller believes was rolled back.
 }
};
