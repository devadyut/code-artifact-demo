/**
 * Shared constants and configuration values for Lambda functions
 * Provides centralized configuration management across all lambda modules
 */

/**
 * Environment and stage configuration
 */
export const ENVIRONMENT = {
  STAGE: process.env.STAGE || process.env.NODE_ENV || 'dev',
  REGION: process.env.AWS_REGION || process.env.REGION || 'eu-west-1',
  SERVICE_NAME: process.env.SERVICE_NAME || 'lambda-service'
};

/**
 * HTTP status codes
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  REQUEST_TOO_LARGE: 413,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

/**
 * Error codes
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  BUSINESS_LOGIC_ERROR: 'BUSINESS_LOGIC_ERROR',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  REQUEST_TOO_LARGE: 'REQUEST_TOO_LARGE',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INVALID_JSON: 'INVALID_JSON'
};

/**
 * Common AWS service configuration
 */
export const AWS_CONFIG = {
  REGION: process.env.AWS_REGION || process.env.REGION || 'eu-west-1',
  S3_BUCKET: process.env.S3_BUCKET,
  EMAIL_NOTIFICATION_TOPIC: process.env.EMAIL_NOTIFICATION_TOPIC,
  TICKET_TAILOR_API_DOMAIN: process.env.TICKET_TAILOR_API_DOMAIN,
  TICKET_TAILOR_ENDPOINT: process.env.TICKET_TAILOR_ENDPOINT
};

/**
 * DynamoDB table naming patterns
 */
export const TABLE_PATTERNS = {
  /**
   * Generate table name with environment prefix
   * @param {string} tableName - Base table name
   * @returns {string} Full table name with environment prefix
   */
  getTableName: (tableName) => {
    const env = process.env.ENVIRONMENT || ENVIRONMENT.STAGE;
    const service = process.env.SERVICE_NAME || ENVIRONMENT.SERVICE_NAME;
    return `${env}.${service}.${tableName}`;
  },

  /**
   * Generate sequence table name
   * @returns {string} Sequence table name
   */
  getSequenceTable: () => {
    return TABLE_PATTERNS.getTableName('sequence');
  },

  /**
   * Generate audit trail table name
   * @returns {string} Audit trail table name
   */
  getAuditTrailTable: () => {
    return TABLE_PATTERNS.getTableName('auditTrail');
  }
};

/**
 * S3 key patterns
 */
export const S3_PATTERNS = {
  /**
   * Generate S3 key with environment prefix
   * @param {string} fileName - File name
   * @returns {string} Full S3 key with environment prefix
   */
  getKey: (fileName) => {
    const env = process.env.ENVIRONMENT || ENVIRONMENT.STAGE;
    const service = process.env.SERVICE_NAME || ENVIRONMENT.SERVICE_NAME;
    return `${env}/${service}/${fileName}`;
  },

  /**
   * Generate configuration file key
   * @param {string} configType - Configuration type (type, status, action, etc.)
   * @returns {string} Configuration file S3 key
   */
  getConfigKey: (configType) => {
    return S3_PATTERNS.getKey(`${configType}.json`);
  }
};

/**
 * SNS topic ARN patterns
 */
export const SNS_PATTERNS = {
  /**
   * Generate SNS topic ARN
   * @param {string} topicName - Topic name
   * @param {string} accountId - AWS account ID
   * @returns {string} Full SNS topic ARN
   */
  getTopicArn: (topicName, accountId) => {
    const region = AWS_CONFIG.REGION;
    return `arn:aws:sns:${region}:${accountId}:${topicName}`;
  },

  /**
   * Generate email notification topic ARN
   * @param {string} accountId - AWS account ID
   * @returns {string} Email notification topic ARN
   */
  getEmailNotificationArn: (accountId) => {
    const topicName = process.env.EMAIL_NOTIFICATION_TOPIC;
    return SNS_PATTERNS.getTopicArn(topicName, accountId);
  }
};

/**
 * Pagination defaults
 */
export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  DEFAULT_PAGE_SIZE: 50
};

/**
 * Common regex patterns
 */
export const PATTERNS = {
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  USERNAME: /^[a-zA-Z0-9]{3,30}$/,
  COUNTRY_CODE: /^[A-Z]{2}$/,
  PHONE: /^\+?[\d\s\-\(\)]+$/,
  DATE_ISO: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/,
  DATE_SIMPLE: /^\d{4}-\d{2}-\d{2}$/
};

/**
 * Request status values
 */
export const REQUEST_STATUS = {
  SUBMITTED: 'Submitted',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected'
};

/**
 * Request types
 */
export const REQUEST_TYPES = {
  ENQUIRY: 'enquiry',
  MEMBERSHIP: 'membership',
  SUPPORT: 'support',
  GENERAL: 'general'
};

/**
 * Request actions
 */
export const REQUEST_ACTIONS = {
  CREATE: 'Create Request',
  UPDATE: 'Update Request',
  APPROVE: 'Approve Request',
  REJECT: 'Reject Request',
  COMPLETE: 'Complete Request'
};

/**
 * Log levels
 */
export const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

/**
 * CORS configuration
 */
export const CORS_CONFIG = {
  ALLOW_ORIGIN: "*",
  ALLOW_CREDENTIALS: true,
  ALLOW_HEADERS: "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Correlation-ID",
  ALLOW_METHODS: "GET,POST,PUT,DELETE,OPTIONS",
  MAX_AGE: "86400"
};

/**
 * Rate limiting configuration
 */
export const RATE_LIMIT = {
  DEFAULT_MAX_REQUESTS: 100,
  DEFAULT_WINDOW_MS: 60000, // 1 minute
  BURST_MAX_REQUESTS: 10,
  BURST_WINDOW_MS: 1000 // 1 second
};

/**
 * Timeout configuration
 */
export const TIMEOUTS = {
  DEFAULT_REQUEST_TIMEOUT: 30000, // 30 seconds
  DATABASE_TIMEOUT: 5000, // 5 seconds
  EXTERNAL_API_TIMEOUT: 10000 // 10 seconds
};

/**
 * File size limits
 */
export const FILE_LIMITS = {
  MAX_UPLOAD_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_JSON_SIZE: 1024 * 1024, // 1MB
  MAX_IMAGE_SIZE: 5 * 1024 * 1024 // 5MB
};

/**
 * Common date formats
 */
export const DATE_FORMATS = {
  ISO_DATETIME: 'YYYY-MM-DDTHH:mm:ss',
  ISO_DATE: 'YYYY-MM-DD',
  DISPLAY_DATETIME: 'DD/MM/YYYY HH:mm',
  DISPLAY_DATE: 'DD/MM/YYYY'
};

/**
 * Media types
 */
export const MEDIA_TYPES = {
  JSON: 'application/json',
  XML: 'application/xml',
  TEXT: 'text/plain',
  HTML: 'text/html',
  PDF: 'application/pdf',
  IMAGE_JPEG: 'image/jpeg',
  IMAGE_PNG: 'image/png',
  IMAGE_GIF: 'image/gif'
};

/**
 * Cache configuration
 */
export const CACHE_CONFIG = {
  DEFAULT_TTL: 300, // 5 minutes
  SHORT_TTL: 60, // 1 minute
  LONG_TTL: 3600, // 1 hour
  MAX_TTL: 86400 // 24 hours
};

/**
 * Validation limits
 */
export const VALIDATION_LIMITS = {
  MIN_NAME_LENGTH: 1,
  MAX_NAME_LENGTH: 255,
  MIN_DESCRIPTION_LENGTH: 0,
  MAX_DESCRIPTION_LENGTH: 1000,
  MIN_USERNAME_LENGTH: 3,
  MAX_USERNAME_LENGTH: 30,
  MIN_PASSWORD_LENGTH: 8,
  MAX_PASSWORD_LENGTH: 128
};