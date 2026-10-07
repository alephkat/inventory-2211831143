/**
 * Wrap async route handlers so rejected promises forward to the error handler.
 */
export const asyncHandler = (asyncHandler) => Promise<unknown>) =>
 (req, res, next) => {
 Promise.resolve(fn(req, res, next)).catch(next);
 };
