/**
 * Standard API response envelope helpers shared by all controllers.
 * Keeps the contract consistent with the mobile client's `ApiResponse` /
 * `PaginatedResponse` wrappers.
 */
export function sendSuccess(data, message?, meta?) {
 return {
 success: true as const,
 message: message ?? null,
 data,
 meta: meta ?? null,
 };
}

export function sendPaginated(
 items,
 total,
 page,
 limit,
 meta?) {
 return {
 success: true as const,
 data,
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
 value | number | string | undefined,
 fallback,
 max?) => {
 const raw = Array.isArray(value) ? value[0] : value;
 const parsed = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
 if (!Number.isFinite(parsed) || parsed < 1) return fallback;
 return max ? Math.min(max, parsed) : parsed;
};

export function getPagination(query) {
 const page = toPositiveInt(query.page, 1);
 const limit = toPositiveInt(query.limit, 20, 100);
 return { page, limit, skip: (page - 1) * limit };
}
