/**
 * Aggregate utilities package
 * Exports all individual utility packages for convenient importing
 */

// Re-export all utility packages
export * as response from '@myorg/response';
export * as date from '@myorg/date';
export * as array from '@myorg/array';
export * as error from '@myorg/error';
export * as logger from '@myorg/logger';
export * as middleware from '@myorg/middleware';
export * as constants from '@myorg/constants';
export * as validation from '@myorg/validation';


// Export default imports for convenience
export { default as Logger } from '@myorg/logger';
export { default as ResponseHelper } from '@myorg/response';
export { default as ErrorHandler } from '@myorg/error';
export { default as ValidationHelper } from '@myorg/validation';

export { default as MiddlewareHelper } from '@myorg/middleware';
export { default as DateHelper } from '@myorg/date';
export { default as ArrayHelper } from '@myorg/array';

// Export commonly used functions directly for convenience
export {
  createResponse,
  createErrorResponse,
  createValidationErrorResponse,
  createNotFoundResponse,
  createConflictResponse,
  createUnauthorizedResponse,
  createForbiddenResponse,
  createCreatedResponse,
  createNoContentResponse,
  createPaginatedResponse,
  DEFAULT_CORS_HEADERS
} from '@myorg/response';

export {
  dateTimeFullFormatToString,
  dateFormatToString,
  getCurrentDateTimeString,
  getCurrentDateString,
  parseDateToFullFormat,
  parseDateToDateFormat,
  addDays,
  addHours,
  isToday,
  daysDifference,
  formatForDisplay,
  formatDateTimeForDisplay
} from '@myorg/date';

export {
  distinctValues,
  groupBy,
  distinctObjects,
  sortBy,
  filterBy,
  chunk,
  flatten,
  unique,
  intersection,
  difference,
  shuffle,
  random,
  isEmpty,
  sum,
  average,
  min,
  max
} from '@myorg/array';

export {
  classifyError,
  logError,
  createErrorClass,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  BusinessLogicError,
  ValidationError,
  asyncHandler,
  isErrorType,
  isDynamoDBError,
  sanitizeHeaders
} from '@myorg/error';

export {
  corsMiddleware,
  addCorsHeaders,
  jsonBodyParser,
  validationMiddleware,
  pathParameterValidation,
  queryParameterValidation,
  requestLoggingMiddleware,
  errorHandlingMiddleware,
  rateLimitingMiddleware,
  composeMiddleware,
  withMiddleware,
  authenticationMiddleware
} from '@myorg/middleware';

export {
  ENVIRONMENT,
  HTTP_STATUS,
  ERROR_CODES,
  AWS_CONFIG,
  TABLE_PATTERNS,
  S3_PATTERNS,
  SNS_PATTERNS,
  PAGINATION,
  PATTERNS,
  REQUEST_STATUS,
  REQUEST_TYPES,
  REQUEST_ACTIONS,
  LOG_LEVELS,
  CORS_CONFIG,
  RATE_LIMIT,
  TIMEOUTS,
  FILE_LIMITS,
  DATE_FORMATS,
  MEDIA_TYPES,
  CACHE_CONFIG,
  VALIDATION_LIMITS
} from '@myorg/constants';

export {
  validateEmail,
  validateRequired,
  validateStringLength,
  validateUUID,
  validateNumber,
  validateInteger,
  validateDate,
  validateEnum,
  validateArray,
  sanitizeInput,
  sanitizeHtml,
  validatePhone,
  validateUsername,
  validateObject,
  validatePagination,
  PATTERNS as VALIDATION_PATTERNS
} from '@myorg/validation';