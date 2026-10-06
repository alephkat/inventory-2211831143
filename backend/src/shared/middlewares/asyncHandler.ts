import type { Request, Response, NextFunction } from 'express';

/**
 * Wrap async route handlers so rejected promises forward to the error handler.
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
