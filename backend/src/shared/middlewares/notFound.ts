import type { Request, Response, NextFunction } from 'express';
import HttpStatus from 'http-status';
import { ApiError } from '../errors/ApiError';

export const notFoundHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  next(
    new ApiError(
      `Not Found - ${req.method} ${req.originalUrl}`,
      HttpStatus.NOT_FOUND,
    ),
  );
};
