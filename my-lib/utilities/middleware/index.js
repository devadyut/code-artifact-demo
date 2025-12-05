/**
 * Common middleware functions for Lambda handlers
 * Provides reusable middleware patterns for CORS, validation, authentication, etc.
 */
class MiddlewareHelper {
  /**
   * Default CORS headers
   */
  static DEFAULT_CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Credentials": true,
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Correlation-ID",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
  };

  /**
   * CORS middleware for handling preflight requests
   * @param {Object} event - Lambda event object
   * @param {Object} context - Lambda context object
   * @param {Function} next - Next middleware function
   * @returns {Object|void} CORS response for OPTIONS or continues to next middleware
   */
  static corsMiddleware(event, context, next) {
    // Handle preflight OPTIONS requests
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          ...this.DEFAULT_CORS_HEADERS,
          "Access-Control-Max-Age": "86400" // Cache preflight for 24 hours
        },
        body: ''
      };
    }
    
    // Continue to next middleware
    return next(event, context);
  }

  /**
   * Add CORS headers to response
   * @param {Object} response - Lambda response object
   * @param {Object} customHeaders - Custom CORS headers to override defaults
   * @returns {Object} Response with CORS headers added
   */
  static addCorsHeaders(response, customHeaders = {}) {
    return {
      ...response,
      headers: {
        ...this.DEFAULT_CORS_HEADERS,
        ...customHeaders,
        ...response.headers
      }
    };
  }

  /**
   * JSON body parser middleware
   * @param {Object} event - Lambda event object
   * @param {Object} context - Lambda context object
   * @param {Function} next - Next middleware function
   * @returns {Object} Event with parsed body or error response
   */
  static jsonBodyParser(event, context, next) {
    if (event.body) {
      try {
        event.parsedBody = JSON.parse(event.body);
      } catch (error) {
        return {
          statusCode: 400,
          headers: this.DEFAULT_CORS_HEADERS,
          body: JSON.stringify({
            error: {
              message: 'Invalid JSON in request body',
              code: 'INVALID_JSON'
            }
          })
        };
      }
    }
    
    return next(event, context);
  }

  /**
   * Request validation middleware
   * @param {Function} validator - Validation function that returns { isValid, errors, value }
   * @returns {Function} Middleware function
   */
  static validationMiddleware(validator) {
    const self = this;
    return function(event, context, next) {
      const validation = validator(event.parsedBody || event.body, event.pathParameters, event.queryStringParameters);
      
      if (!validation.isValid) {
        return {
          statusCode: 400,
          headers: self.DEFAULT_CORS_HEADERS,
          body: JSON.stringify({
            error: {
              message: 'Validation failed',
              code: 'VALIDATION_ERROR',
              details: validation.errors
            }
          })
        };
      }
      
      // Add validated data to event
      event.validatedData = validation.value;
      
      return next(event, context);
    };
  }

  /**
   * Path parameter validation middleware
   * @param {Object} paramValidators - Object with parameter names as keys and validator functions as values
   * @returns {Function} Middleware function
   */
  static pathParameterValidation(paramValidators) {
    const self = this;
    return function(event, context, next) {
      const pathParameters = event.pathParameters || {};
      const errors = {};
      
      for (const [param, validator] of Object.entries(paramValidators)) {
        const value = pathParameters[param];
        const validation = validator(value);
        
        if (!validation.isValid) {
          errors[param] = validation.errors;
        }
      }
      
      if (Object.keys(errors).length > 0) {
        return {
          statusCode: 400,
          headers: self.DEFAULT_CORS_HEADERS,
          body: JSON.stringify({
            error: {
              message: 'Invalid path parameters',
              code: 'VALIDATION_ERROR',
              details: errors
            }
          })
        };
      }
      
      return next(event, context);
    };
  }

  /**
   * Query parameter validation middleware
   * @param {Object} queryValidators - Object with query parameter names as keys and validator functions as values
   * @returns {Function} Middleware function
   */
  static queryParameterValidation(queryValidators) {
    const self = this;
    return function(event, context, next) {
      const queryParameters = event.queryStringParameters || {};
      const errors = {};
      const validatedQuery = {};
      
      for (const [param, validator] of Object.entries(queryValidators)) {
        const value = queryParameters[param];
        const validation = validator(value);
        
        if (!validation.isValid) {
          errors[param] = validation.errors;
        } else {
          validatedQuery[param] = validation.value;
        }
      }
      
      if (Object.keys(errors).length > 0) {
        return {
          statusCode: 400,
          headers: self.DEFAULT_CORS_HEADERS,
          body: JSON.stringify({
            error: {
              message: 'Invalid query parameters',
              code: 'VALIDATION_ERROR',
              details: errors
            }
          })
        };
      }
      
      // Add validated query parameters to event
      event.validatedQuery = validatedQuery;
      
      return next(event, context);
    };
  }

  /**
   * Request logging middleware
   * @param {Function} logger - Logger function
   * @returns {Function} Middleware function
   */
  static requestLoggingMiddleware(logger) {
    return function(event, context, next) {
      const startTime = Date.now();
      
      // Log incoming request
      logger.info('Incoming request', {
        httpMethod: event.httpMethod,
        path: event.path,
        pathParameters: event.pathParameters,
        queryStringParameters: event.queryStringParameters,
        userAgent: event.headers?.['User-Agent'] || event.headers?.['user-agent'],
        sourceIp: event.requestContext?.identity?.sourceIp,
        requestTime: new Date().toISOString(),
        bodySize: event.body ? event.body.length : 0
      });
      
      try {
        const result = next(event, context);
        const duration = Date.now() - startTime;
        
        // Log successful response
        logger.info('Request completed', {
          statusCode: result.statusCode,
          duration: `${duration}ms`,
          responseSize: result.body ? result.body.length : 0,
          success: result.statusCode < 400
        });
        
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        
        // Log error
        logger.error('Request failed', {
          duration: `${duration}ms`,
          error: {
            name: error.name,
            message: error.message
          },
          success: false
        });
        
        throw error;
      }
    };
  }

  /**
   * Error handling middleware
   * @param {Function} errorHandler - Error handler function
   * @returns {Function} Middleware function
   */
  static errorHandlingMiddleware(errorHandler) {
    return function(event, context, next) {
      try {
        return next(event, context);
      } catch (error) {
        return errorHandler(error, context);
      }
    };
  }

  /**
   * Rate limiting middleware (basic implementation)
   * @param {number} maxRequests - Maximum requests per time window
   * @param {number} windowMs - Time window in milliseconds
   * @returns {Function} Middleware function
   */
  static rateLimitingMiddleware(maxRequests = 100, windowMs = 60000) {
    const requests = new Map();
    const self = this;
    
    return function(event, context, next) {
      const clientId = event.requestContext?.identity?.sourceIp || 'unknown';
      const now = Date.now();
      const windowStart = now - windowMs;
      
      // Clean old entries
      if (requests.has(clientId)) {
        const clientRequests = requests.get(clientId).filter(time => time > windowStart);
        requests.set(clientId, clientRequests);
      }
      
      // Check rate limit
      const clientRequests = requests.get(clientId) || [];
      if (clientRequests.length >= maxRequests) {
        return {
          statusCode: 429,
          headers: {
            ...self.DEFAULT_CORS_HEADERS,
            'Retry-After': Math.ceil(windowMs / 1000)
          },
          body: JSON.stringify({
            error: {
              message: 'Too many requests',
              code: 'RATE_LIMIT_EXCEEDED'
            }
          })
        };
      }
      
      // Add current request
      clientRequests.push(now);
      requests.set(clientId, clientRequests);
      
      return next(event, context);
    };
  }

  /**
   * Compose multiple middleware functions
   * @param {...Function} middlewares - Middleware functions to compose
   * @returns {Function} Composed middleware function
   */
  static composeMiddleware(...middlewares) {
    return function(event, context) {
      let index = 0;
      
      function next(evt, ctx) {
        if (index >= middlewares.length) {
          throw new Error('No more middleware to execute');
        }
        
        const middleware = middlewares[index++];
        return middleware(evt, ctx, next);
      }
      
      return next(event, context);
    };
  }

  /**
   * Create a middleware wrapper for Lambda handlers
   * @param {Function} handler - Lambda handler function
   * @param {...Function} middlewares - Middleware functions to apply
   * @returns {Function} Wrapped handler function
   */
  static withMiddleware(handler, ...middlewares) {
    return async function(event, context) {
      let currentEvent = event;
      let currentContext = context;
      
      // Apply middleware in order
      for (const middleware of middlewares) {
        const result = middleware(currentEvent, currentContext, (evt, ctx) => {
          currentEvent = evt;
          currentContext = ctx;
          return null; // Continue to next middleware
        });
        
        // If middleware returns a response, return it immediately
        if (result && result.statusCode) {
          return result;
        }
      }
      
      // Execute the actual handler
      return await handler(currentEvent, currentContext);
    };
  }

  /**
   * Simple authentication middleware (checks for Authorization header)
   * @param {Function} authValidator - Function to validate auth token
   * @returns {Function} Middleware function
   */
  static authenticationMiddleware(authValidator) {
    const self = this;
    return function(event, context, next) {
      const authHeader = event.headers?.Authorization || event.headers?.authorization;
      
      if (!authHeader) {
        return {
          statusCode: 401,
          headers: self.DEFAULT_CORS_HEADERS,
          body: JSON.stringify({
            error: {
              message: 'Authorization header required',
              code: 'UNAUTHORIZED'
            }
          })
        };
      }
      
      const validation = authValidator(authHeader);
      if (!validation.isValid) {
        return {
          statusCode: 401,
          headers: self.DEFAULT_CORS_HEADERS,
          body: JSON.stringify({
            error: {
              message: 'Invalid authorization token',
              code: 'UNAUTHORIZED'
            }
          })
        };
      }
      
      // Add user info to event
      event.user = validation.user;
      
      return next(event, context);
    };
  }

}

export default MiddlewareHelper;

// Export for backward compatibility and convenience
export const {
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
  authenticationMiddleware,
  DEFAULT_CORS_HEADERS
} = MiddlewareHelper;