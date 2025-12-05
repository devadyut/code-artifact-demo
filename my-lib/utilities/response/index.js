/**
 * HTTP response utilities with CORS headers for Lambda functions
 * Provides consistent response formatting across all lambda modules
 */
class ResponseHelper {
  /**
   * Default CORS headers used across all responses
   */
  static DEFAULT_CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Credentials": true,
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Correlation-ID",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
  };

  /**
   * Generate a unique request ID for tracking
   * @returns {string} Request ID
   */
  static generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Create a successful HTTP response with CORS headers
   * @param {*} data - Response data (will be JSON stringified)
   * @param {number} statusCode - HTTP status code (default: 200)
   * @param {Object} additionalHeaders - Additional headers to include
   * @param {string} correlationId - Correlation ID for request tracking
   * @returns {Object} API Gateway response object
   */
  static success(data, statusCode = 200, correlationId = null, additionalHeaders = {}) {
    const requestId = correlationId || this.generateRequestId();
    
    return {
      statusCode,
      body: JSON.stringify(data),
      headers: {
        "Content-Type": "application/json",
        ...this.DEFAULT_CORS_HEADERS,
        "X-Correlation-ID": requestId,
        "X-Request-ID": requestId,
        ...additionalHeaders
      }
    };
  }

  /**
   * Create an error HTTP response with CORS headers
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code (default: 500)
   * @param {string} code - Error code
   * @param {Object} details - Additional error details
   * @param {string} correlationId - Correlation ID for request tracking
   * @returns {Object} API Gateway response object
   */
  static error(message, statusCode = 500, code = null, details = null, correlationId = null) {
    const requestId = correlationId || this.generateRequestId();
    
    const errorResponse = {
      error: {
        message,
        ...(code && { code }),
        ...(details && { details })
      },
      requestId,
      correlationId: requestId,
      timestamp: new Date().toISOString()
    };

    return {
      statusCode,
      body: JSON.stringify(errorResponse),
      headers: {
        "Content-Type": "application/json",
        ...this.DEFAULT_CORS_HEADERS,
        "X-Correlation-ID": requestId,
        "X-Request-ID": requestId
      }
    };
  }

  /**
   * Create a validation error response (400)
   * @param {string} message - Validation error message
   * @param {Object} details - Validation error details
   * @param {string} correlationId - Correlation ID for request tracking
   * @returns {Object} API Gateway response object
   */
  static validationError(message, details = null, correlationId = null) {
    return this.error(message, 400, 'VALIDATION_ERROR', details, correlationId);
  }

  /**
   * Create a not found error response (404)
   * @param {string} resource - Resource type that was not found
   * @param {string} id - Resource ID that was not found
   * @param {string} correlationId - Correlation ID for request tracking
   * @returns {Object} API Gateway response object
   */
  static notFound(resource, id, correlationId = null) {
    return this.error(
      `${resource} with ID '${id}' not found`,
      404,
      'NOT_FOUND',
      { resource, id },
      correlationId
    );
  }

  /**
   * Create a conflict error response (409)
   * @param {string} message - Conflict error message
   * @param {Object} details - Conflict details
   * @param {string} correlationId - Correlation ID for request tracking
   * @returns {Object} API Gateway response object
   */
  static conflict(message, details = null, correlationId = null) {
    return this.error(message, 409, 'CONFLICT', details, correlationId);
  }

  /**
   * Create an unauthorized error response (401)
   * @param {string} message - Unauthorized error message
   * @param {string} correlationId - Correlation ID for request tracking
   * @returns {Object} API Gateway response object
   */
  static unauthorized(message = 'Unauthorized', correlationId = null) {
    return this.error(message, 401, 'UNAUTHORIZED', null, correlationId);
  }

  /**
   * Create a forbidden error response (403)
   * @param {string} message - Forbidden error message
   * @param {string} correlationId - Correlation ID for request tracking
   * @returns {Object} API Gateway response object
   */
  static forbidden(message = 'Forbidden', correlationId = null) {
    return this.error(message, 403, 'FORBIDDEN', null, correlationId);
  }

  /**
   * Create a created response (201)
   * @param {*} data - Created resource data
   * @param {string} correlationId - Correlation ID for request tracking
   * @returns {Object} API Gateway response object
   */
  static created(data, correlationId = null) {
    return this.success(data, 201, correlationId);
  }

  /**
   * Create a no content response (204)
   * @param {string} correlationId - Correlation ID for request tracking
   * @returns {Object} API Gateway response object
   */
  static noContent(correlationId = null) {
    const requestId = correlationId || this.generateRequestId();
    
    return {
      statusCode: 204,
      headers: {
        ...this.DEFAULT_CORS_HEADERS,
        "X-Correlation-ID": requestId,
        "X-Request-ID": requestId
      }
    };
  }

  /**
   * Create a paginated response
   * @param {Array} items - Array of items
   * @param {Object} pagination - Pagination metadata
   * @param {string} correlationId - Correlation ID for request tracking
   * @returns {Object} API Gateway response object
   */
  static paginated(items, pagination = {}, correlationId = null) {
    const data = {
      items,
      pagination: {
        count: items.length,
        ...pagination
      }
    };
    return this.success(data, 200, correlationId);
  }
}

export default ResponseHelper;

// Export for backward compatibility and convenience with proper binding
export const createResponse = ResponseHelper.success.bind(ResponseHelper);
export const createErrorResponse = ResponseHelper.error.bind(ResponseHelper);
export const createValidationErrorResponse = ResponseHelper.validationError.bind(ResponseHelper);
export const createNotFoundResponse = ResponseHelper.notFound.bind(ResponseHelper);
export const createConflictResponse = ResponseHelper.conflict.bind(ResponseHelper);
export const createUnauthorizedResponse = ResponseHelper.unauthorized.bind(ResponseHelper);
export const createForbiddenResponse = ResponseHelper.forbidden.bind(ResponseHelper);
export const createCreatedResponse = ResponseHelper.created.bind(ResponseHelper);
export const createNoContentResponse = ResponseHelper.noContent.bind(ResponseHelper);
export const createPaginatedResponse = ResponseHelper.paginated.bind(ResponseHelper);
export const { DEFAULT_CORS_HEADERS } = ResponseHelper;