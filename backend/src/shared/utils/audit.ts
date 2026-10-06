import { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '../config/database';

/**
 * Append a record to the audit trail. Called from services whenever a
 * domain mutation occurs so every change is traceable.
 */
export interface AuditInput {
  userId: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  /**
   * Pass a Prisma transaction client to make the audit row part of the same
   * atomic unit as the change it describes. Without it the audit write uses
   * the root client and is best-effort.
   */
  client?: typeof prisma;
}

/**
 * Prisma's JSON input types reject `Record<string, unknown>` because `unknown`
 * is not assignable to `JsonValue`. Narrowing here keeps the JSON contract
 * intact while letting callers pass plain objects.
 */
const toJson = (value: Record<string, unknown> | null | undefined) =>
  (value ?? undefined) as Prisma.InputJsonValue | undefined;

export const createAuditLog = async (input: AuditInput) => {
  const db = input.client ?? prisma;
  try {
    const user = await db.user.findUnique({
      where: { id: input.userId },
      select: { fullName: true, username: true },
    });
    await db.auditLog.create({
      data: {
        userId: input.userId,
        userName: user?.fullName || user?.username || input.userId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        oldValues: toJson(input.oldValues),
        newValues: toJson(input.newValues),
        ipAddress: input.ipAddress ?? undefined,
        userAgent: input.userAgent ?? undefined,
      },
    });
  } catch {
    // Audit logging must never break the core operation. A dropped audit row
    // is a problem worth alerting on, but failing the stock movement that
    // already succeeded is worse: it would leave the database in a state the
    // caller believes was rolled back.
  }
};
