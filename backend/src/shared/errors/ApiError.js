import HttpStatus from 'http-status';

export class ApiError extends Error {
 statusCode;
 isOperational;

 constructor(
 message,
 statusCode = HttpStatus.INTERNAL_SERVER_ERROR,
 isOperational = true) {
 super(message);
 this.statusCode = statusCode;
 this.isOperational = isOperational;
 Object.setPrototypeOf(this, new.target.prototype);
 this.name = this.constructor.name;
 }

 static badRequest(message) {
 return new ApiError(message, HttpStatus.BAD_REQUEST);
 }
 static unauthorized(message = 'Unauthorized') {
 return new ApiError(message, HttpStatus.UNAUTHORIZED);
 }
 static forbidden(message = 'Forbidden') {
 return new ApiError(message, HttpStatus.FORBIDDEN);
 }
 static notFound(message = 'Resource not found') {
 return new ApiError(message, HttpStatus.NOT_FOUND);
 }
 static conflict(message = 'Conflict') {
 return new ApiError(message, HttpStatus.CONFLICT);
 }
}
