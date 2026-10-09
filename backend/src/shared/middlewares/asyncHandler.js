/**
 * Wrap async route handlers so rejected promises forward to the error handler.
 */
export const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};
