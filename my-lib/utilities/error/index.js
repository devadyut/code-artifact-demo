/**
 * Standardized error handling utilities for Lambda functions
 * Provides consistent error handling and classification across all lambda modules
 */
class ErrorHandler {
  /**
   * Generate a unique request ID for tracking
   * @returns {string} Request ID
   */
  static generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Sanitize headers for logging (remove sensitive information)
   * @param {Object} headers - Request headers
   * @returns {Object} Sanitized headers
   */
  static sanitizeHeaders(headers) {
    if (!headers) return {};
    
    const sensitiveHeaders = ['authorization', 'x-api-key', 'cookie'];
    const sanitized = { ...headers };
    
    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });
    
    return sanitized;
  }

  /**
   * Create a standardized error response object
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {string} code - Error code
   * @param {Object} details - Additional error details
   * @param {string} correlationId - Correlation ID for request tracking
   * @returns {Object} Standardized error response
   */
  static createErrorResponse(message, statusCode = 500, code = null, details = null, correlationId = null) {
    const requestId = correlationId || this.generateRequestId();
    
    return {
      error: {
        message,
        ...(code && { code }),
        ...(details && { details })
      },
      requestId,
      correlationId: requestId,
      timestamp: new Date().toISOString(),
      statusCode
    };
  }

  /**
   * Classify and handle different types of errors
   * @param {Error} error - Error object
   * @param {Object} context - Lambda context
   * @returns {Object} Classified error response
   */
  static handleError(error, context = {}) {
    const correlationId = context.correlationId || context.awsRequestId || this.generateRequestId();
  
    // Handle different error types
    switch (error.name) {
      case 'ValidationError':
        return this.createErrorResponse(error.message, 400, 'VALIDATION_ERROR', error.errors, correlationId);
      
      case 'NotFoundError':
        return this.createErrorResponse(
          `${error.resource || 'Resource'} with ID '${error.id || 'unknown'}' not found`,
          404,
          'NOT_FOUND',
          { resource: error.resource, id: error.id },
          correlationId
        );
      
      case 'ConflictError':
        return this.createErrorResponse(error.message, 409, 'CONFLICT', error.details, correlationId);
      
      case 'UnauthorizedError':
        return this.createErrorResponse(error.message || 'Unauthorized', 401, 'UNAUTHORIZED', null, correlationId);
      
      case 'ForbiddenError':
        return this.createErrorResponse(error.message || 'Forbidden', 403, 'FORBIDDEN', null, correlationId);
      
      case 'BusinessLogicError':
        return this.createErrorResponse(error.message, 400, 'BUSINESS_LOGIC_ERROR', error.details, correlationId);
      
      // DynamoDB specific errors
      case 'ConditionalCheckFailedException':
        return this.createErrorResponse('Resource has been modified by another request', 409, 'CONFLICT', null, correlationId);
      
      case 'ResourceNotFoundException':
        return this.createErrorResponse('Resource not found', 404, 'NOT_FOUND', null, correlationId);
      
      case 'ProvisionedThroughputExceededException':
      case 'ThrottlingException':
        return this.createErrorResponse('Service temporarily unavailable. Please try again later.', 503, 'SERVICE_UNAVAILABLE', null, correlationId);
      
      case 'ItemCollectionSizeLimitExceededException':
        return this.createErrorResponse('Request payload too large', 413, 'REQUEST_TOO_LARGE', null, correlationId);
      
      case 'ValidationException':
        return this.createErrorResponse('Invalid request parameters', 400, 'VALIDATION_ERROR', { dynamoDbError: error.message }, correlationId);
      
      case 'AccessDeniedException':
        return this.createErrorResponse('Access denied to requested resource', 403, 'FORBIDDEN', null, correlationId);
      
      case 'InternalServerError':
      case 'ServiceUnavailableException':
        return this.createErrorResponse('Service temporarily unavailable', 503, 'SERVICE_UNAVAILABLE', null, correlationId);
      
      // JSON parsing errors
      case 'SyntaxError':
        if (error.message.includes('JSON')) {
          return this.createErrorResponse('Invalid JSON in request body', 400, 'VALIDATION_ERROR', { parseError: error.message }, correlationId);
        }
        break;
      
      // Timeout errors
      case 'TimeoutError':
        return this.createErrorResponse('Request timeout', 408, 'REQUEST_TIMEOUT', null, correlationId);
      
      default:
        // Generic server error with optional development details
        const errorDetails = process.env.NODE_ENV === 'development' ? {
          stack: error.stack,
          errorType: error.constructor.name,
          errorCode: error.code
        } : undefined;
        
        return this.createErrorResponse(
          'Internal server error',
          500,
          'INTERNAL_SERVER_ERROR',
          errorDetails,
          correlationId
        );
    }
  }

  /**
   * Log error with standardized format
   * @param {Error} error - Error object
   * @param {Object} context - Lambda context
   * @param {Object} additionalInfo - Additional information to log
   */
  static logError(error, context = {}, additionalInfo = {}) {
    const correlationId = context.correlationId || context.awsRequestId || this.generateRequestId();
    
    const errorLog = {
      correlationId,
      requestId: correlationId,
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        code: error.code,
        statusCode: error.statusCode
      },
      functionName: context.functionName,
      functionVersion: context.functionVersion,
      memoryLimitInMB: context.memoryLimitInMB,
      remainingTimeInMillis: context.getRemainingTimeInMillis ? context.getRemainingTimeInMillis() : undefined,
      ...additionalInfo
    };
    
    console.error('Lambda function error:', JSON.stringify(errorLog, null, 2));
  }

  /**
   * Create custom error classes
   * @param {string} name - Error class name
   * @param {string} defaultMessage - Default error message
   * @param {number} statusCode - Default HTTP status code
   * @returns {Function} Custom error class constructor
   */
  static createError(name, defaultMessage, statusCode = 500) {
    class CustomError extends Error {
      constructor(message = defaultMessage, details = null) {
        super(message);
        this.name = name;
        this.statusCode = statusCode;
        this.details = details;
      }
    }
    return CustomError;
  }

  /**
   * Wrap async function with error handling
   * @param {Function} asyncFunction - Async function to wrap
   * @returns {Function} Wrapped function that handles errors
   */
  static asyncHandler(asyncFunction) {
    return async (...args) => {
      try {
        return await asyncFunction(...args);
      } catch (error) {
        throw error; // Re-throw to be caught by main error handler
      }
    };
  }

  /**
   * Check if error is a specific type
   * @param {Error} error - Error to check
   * @param {string} errorType - Error type to check for
   * @returns {boolean} True if error matches type
   */
  static isErrorType(error, errorType) {
    return error && error.name === errorType;
  }

  /**
   * Check if error is a DynamoDB error
   * @param {Error} error - Error to check
   * @returns {boolean} True if error is from DynamoDB
   */
  static isDynamoDBError(error) {
    const dynamoErrors = [
      'ConditionalCheckFailedException',
      'ResourceNotFoundException',
      'ProvisionedThroughputExceededException',
      'ThrottlingException',
      'ItemCollectionSizeLimitExceededException',
      'ValidationException',
      'AccessDeniedException',
      'InternalServerError',
      'ServiceUnavailableException'
    ];
    
    return error && dynamoErrors.includes(error.name);
  }

  /**
   * Wrap Lambda handler with error handling
   * @param {Function} handler - Lambda handler function
   * @returns {Function} Wrapped handler function
   */
  static wrapHandler(handler) {
    return async (event, context) => {
      try {
        return await handler(event, context);
      } catch (error) {
        return this.handleError(error, context);
      }
    };
  }
}

// Pre-defined custom error classes
const NotFoundError = ErrorHandler.createError('NotFoundError', 'Resource not found', 404);
const ConflictError = ErrorHandler.createError('ConflictError', 'Resource conflict', 409);
const UnauthorizedError = ErrorHandler.createError('UnauthorizedError', 'Unauthorized', 401);
const ForbiddenError = ErrorHandler.createError('ForbiddenError', 'Forbidden', 403);
const BusinessLogicError = ErrorHandler.createError('BusinessLogicError', 'Business logic error', 400);
const ValidationError = ErrorHandler.createError('ValidationError', 'Validation failed', 400);

export default ErrorHandler;

// Export for backward compatibility and convenience
export {
  ErrorHandler,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  BusinessLogicError,
  ValidationError
};

export const {
  handleError: classifyError,
  logError,
  createError: createErrorClass,
  asyncHandler,
  isErrorType,
  isDynamoDBError,
  sanitizeHeaders
} = ErrorHandler;