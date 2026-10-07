import HttpStatus from 'http-status';
import { ApiError } from './ApiError.js';

export const errorHandler = (errorHandler) => {
 let error = err;

 if (!(error instanceof ApiError)) {
 const message =
 error instanceof Error ? error.message : 'Something went wrong';
 error = new ApiError(
 message,
 HttpStatus.INTERNAL_SERVER_ERROR,
 false
 );
 }

 const apiError = error;

 if (process.env.NODE_ENV !== 'production' && !apiError.isOperational) {
 // eslint-disable-next-line no-console
 console.error('[ERROR]', apiError);
 }

 const response = {
 success: false,
 message: apiError.message,
 code: apiError.statusCode,
 };

 if (process.env.NODE_ENV !== 'production' && !apiError.isOperational) {
 response.stack = apiError.stack;
 }

 res.status(apiError.statusCode).json(response);
};