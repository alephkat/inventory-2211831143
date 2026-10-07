/**
 * Validate request payload against a Zod schema.
 */
export const validate =
 (schema, where: 'body' | 'query' | 'params' = 'body') =>
 (req, res, next) => {
 const result = schema.safeParse(req[where]);
 if (!result.success) {
 return res.status(400).json({
 success: false,
 message: 'Validation failed',
 errors: result.error.errors.map((e) => ({
 path: e.path.join('.'),
 message: e.message,
 })),
 code: 400,
 });
 }
 req[where] = result.data;
 next();
 };
