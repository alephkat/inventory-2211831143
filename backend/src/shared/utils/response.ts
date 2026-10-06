/**
 * Standard API response envelope helpers shared by all controllers.
 * Keeps the contract consistent with the mobile client's `ApiResponse` /
 * `PaginatedResponse` wrappers.
 */
export function sendSuccess<T>(data: T, message?: string, meta?: Record<string, unknown>) {
  return {
    success: true as const,
    message: message ?? null,
    data,
    meta: meta ?? null,
  };
}

export function sendPaginated<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
  meta?: Record<string, unknown>,
) {
  return {
    success: true as const,
    data: {
      items,
      total,
      page,
      limit,
      hasNext: total > page * limit,
      hasPrev: page > 1,
    },
    meta: meta ?? null,
  };
}

/**
 * Normalise pagination input. Accepts raw query strings (when no Zod schema
 * ran) as well as the numbers a coercing schema produces, and falls back to
 * the defaults for anything unparseable — `parseInt('abc')` is `NaN`, which
 * would otherwise reach Prisma as a broken `skip`.
 */
const toPositiveInt = (
  value: string | number | string[] | undefined,
  fallback: number,
  max?: number,
): number => {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return max ? Math.min(max, parsed) : parsed;
};

export function getPagination(query: {
  page?: string | number | string[];
  limit?: string | number | string[];
}) {
  const page = toPositiveInt(query.page, 1);
  const limit = toPositiveInt(query.limit, 20, 100);
  return { page, limit, skip: (page - 1) * limit };
}
