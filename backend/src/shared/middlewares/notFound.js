import HttpStatus from 'http-status';
import { ApiError } from '../errors/ApiError.js';
export const notFoundHandler = (req, _res, next) => {
    next(new ApiError(`Not Found - ${req.method} ${req.originalUrl}`, HttpStatus.NOT_FOUND));
};
