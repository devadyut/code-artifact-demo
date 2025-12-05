/**
 * Centralized logging utilities for Lambda functions
 * Provides structured logging with different log levels and context tracking
 */

/**
 * Log levels enumeration
 */
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

/**
 * Logger class for structured logging
 */
class Logger {
  /**
   * Get current log level from environment
   * @returns {number} Current log level
   */
  static getCurrentLevel() {
    const level = process.env.LOG_LEVEL || 'INFO';
    return LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
  }

  /**
   * Check if logging is enabled for a level
   * @param {number} level - Log level to check
   * @returns {boolean} Whether logging is enabled
   */
  static isLevelEnabled(level) {
    return level <= this.getCurrentLevel();
  }

  /**
   * Get request ID from context or generate one
   * @returns {string} Request ID
   */
  static getRequestId() {
    // Try to get from Lambda context if available
    if (global.lambdaContext && global.lambdaContext.awsRequestId) {
      return global.lambdaContext.awsRequestId;
    }
    
    // Generate a simple request ID
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Create structured log entry
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   * @returns {Object} Structured log entry
   */
  static createLogEntry(level, message, metadata = {}) {
    return {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      service: process.env.SERVICE_NAME || 'lambda-service',
      stage: process.env.STAGE || process.env.NODE_ENV || 'dev',
      requestId: metadata.requestId || this.getRequestId(),
      ...metadata
    };
  }

  /**
   * Log error message
   * @param {string} message - Error message
   * @param {Object} metadata - Additional metadata
   */
  static error(message, metadata = {}) {
    if (this.isLevelEnabled(LOG_LEVELS.ERROR)) {
      const logEntry = this.createLogEntry('ERROR', message, metadata);
      console.error(JSON.stringify(logEntry));
    }
  }

  /**
   * Log warning message
   * @param {string} message - Warning message
   * @param {Object} metadata - Additional metadata
   */
  static warn(message, metadata = {}) {
    if (this.isLevelEnabled(LOG_LEVELS.WARN)) {
      const logEntry = this.createLogEntry('WARN', message, metadata);
      console.warn(JSON.stringify(logEntry));
    }
  }

  /**
   * Log info message
   * @param {string} message - Info message
   * @param {Object} metadata - Additional metadata
   */
  static info(message, metadata = {}) {
    if (this.isLevelEnabled(LOG_LEVELS.INFO)) {
      const logEntry = this.createLogEntry('INFO', message, metadata);
      console.log(JSON.stringify(logEntry));
    }
  }

  /**
   * Log debug message
   * @param {string} message - Debug message
   * @param {Object} metadata - Additional metadata
   */
  static debug(message, metadata = {}) {
    if (this.isLevelEnabled(LOG_LEVELS.DEBUG)) {
      const logEntry = this.createLogEntry('DEBUG', message, metadata);
      console.log(JSON.stringify(logEntry));
    }
  }

  /**
   * Log function execution time
   * @param {string} functionName - Name of the function
   * @param {Function} fn - Function to execute and time
   * @param {...any} args - Arguments to pass to the function
   * @returns {any} Function result
   */
  static async timeFunction(functionName, fn, ...args) {
    const startTime = Date.now();
    
    try {
      const result = await fn(...args);
      const duration = Date.now() - startTime;
      
      this.info(`Function execution completed`, {
        function: functionName,
        duration: `${duration}ms`,
        success: true
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.error(`Function execution failed`, {
        function: functionName,
        duration: `${duration}ms`,
        success: false,
        error: {
          name: error.name,
          message: error.message
        }
      });
      
      throw error;
    }
  }

  /**
   * Log database operation
   * @param {string} operation - Database operation (get, put, update, delete, query, scan)
   * @param {string} tableName - Table name
   * @param {Object} params - Operation parameters
   * @param {number} duration - Operation duration in ms
   * @param {boolean} success - Whether operation was successful
   * @param {Error} error - Error if operation failed
   */
  static logDatabaseOperation(operation, tableName, params = {}, duration = 0, success = true, error = null) {
    const metadata = {
      operation: 'database',
      dbOperation: operation,
      tableName,
      duration: `${duration}ms`,
      success,
      ...(error && {
        error: {
          name: error.name,
          message: error.message
        }
      })
    };

    // Don't log sensitive data, just operation metadata
    if (params.Key) {
      metadata.hasKey = true;
    }
    if (params.Item) {
      metadata.hasItem = true;
    }
    if (params.UpdateExpression) {
      metadata.hasUpdateExpression = true;
    }

    if (success) {
      this.debug(`Database operation completed`, metadata);
    } else {
      this.error(`Database operation failed`, metadata);
    }
  }

  /**
   * Log HTTP request
   * @param {Object} event - Lambda event object
   * @param {Object} context - Lambda context
   */
  static logRequest(event, context = {}) {
    this.info('Incoming request', {
      httpMethod: event.httpMethod,
      path: event.path,
      pathParameters: event.pathParameters,
      queryStringParameters: event.queryStringParameters,
      userAgent: event.headers?.['User-Agent'] || event.headers?.['user-agent'],
      sourceIp: event.requestContext?.identity?.sourceIp,
      requestTime: new Date().toISOString(),
      bodySize: event.body ? event.body.length : 0,
      functionName: context.functionName,
      functionVersion: context.functionVersion
    });
  }

  /**
   * Log HTTP response
   * @param {Object} response - Lambda response object
   * @param {number} duration - Request duration in ms
   */
  static logResponse(response, duration = 0) {
    this.info('Request completed', {
      statusCode: response.statusCode,
      duration: `${duration}ms`,
      responseSize: response.body ? response.body.length : 0,
      success: response.statusCode < 400
    });
  }

  /**
   * Create a child logger with additional context
   * @param {Object} context - Additional context to include in all logs
   * @returns {Object} Child logger
   */
  static createChildLogger(context = {}) {
    return {
      error: (message, metadata = {}) => this.error(message, { ...context, ...metadata }),
      warn: (message, metadata = {}) => this.warn(message, { ...context, ...metadata }),
      info: (message, metadata = {}) => this.info(message, { ...context, ...metadata }),
      debug: (message, metadata = {}) => this.debug(message, { ...context, ...metadata }),
      timeFunction: (functionName, fn, ...args) => this.timeFunction(functionName, fn, ...args),
      logDatabaseOperation: (operation, tableName, params, duration, success, error) => 
        this.logDatabaseOperation(operation, tableName, params, duration, success, error)
    };
  }

  /**
   * Set Lambda context for request ID tracking
   * @param {Object} context - Lambda context
   */
  static setLambdaContext(context) {
    global.lambdaContext = context;
  }

  /**
   * Clear Lambda context
   */
  static clearLambdaContext() {
    global.lambdaContext = null;
  }

  /**
   * Log performance metrics
   * @param {string} metric - Metric name
   * @param {number} value - Metric value
   * @param {string} unit - Metric unit (ms, bytes, count, etc.)
   * @param {Object} metadata - Additional metadata
   */
  static logMetric(metric, value, unit = 'count', metadata = {}) {
    this.info('Performance metric', {
      metric,
      value,
      unit,
      ...metadata
    });
  }

  /**
   * Log business event
   * @param {string} event - Event name
   * @param {Object} data - Event data
   * @param {Object} metadata - Additional metadata
   */
  static logBusinessEvent(event, data = {}, metadata = {}) {
    this.info('Business event', {
      event,
      data,
      ...metadata
    });
  }
}

// Export the Logger class and log levels
export default Logger;
export { LOG_LEVELS };

// Export individual logging functions for convenience
export const { error, warn, info, debug, timeFunction, logDatabaseOperation, createChildLogger, setLambdaContext, clearLambdaContext, logRequest, logResponse, logMetric, logBusinessEvent } = Logger;