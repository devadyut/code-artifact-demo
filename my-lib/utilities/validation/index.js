/**
 * Input validation and data sanitization utilities for Lambda functions
 * Provides common validation patterns and sanitization functions
 */
class ValidationHelper {
  /**
   * Common regex patterns for validation
   */
  static PATTERNS = {
    UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    USERNAME: /^[a-zA-Z0-9]{3,30}$/,
    COUNTRY_CODE: /^[A-Z]{2}$/,
    PHONE: /^\+?[\d\s\-\(\)]+$/,
    DATE_ISO: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/,
    DATE_SIMPLE: /^\d{4}-\d{2}-\d{2}$/,
    ALPHANUMERIC: /^[a-zA-Z0-9]+$/,
    NUMERIC: /^\d+$/,
    DECIMAL: /^\d+(\.\d+)?$/
  };

  /**
   * Create a validation result object
   * @param {boolean} isValid - Whether validation passed
   * @param {Array} errors - Array of validation errors
   * @param {*} value - Validated value
   * @returns {ValidationResult} Validation result
   */
  static createValidationResult(isValid, errors = [], value = null) {
    return { isValid, errors, value };
  }

  /**
   * Validate email address
   * @param {string} email - Email to validate
   * @param {boolean} required - Whether email is required
   * @returns {ValidationResult} Validation result
   */
  static validateEmail(email, required = true) {
    if (!email) {
      return required 
        ? this.createValidationResult(false, ['Email is required'])
        : this.createValidationResult(true, [], null);
    }

    if (typeof email !== 'string') {
      return this.createValidationResult(false, ['Email must be a string']);
    }

    const sanitized = email.trim().toLowerCase();
    
    if (!this.PATTERNS.EMAIL.test(sanitized)) {
      return this.createValidationResult(false, ['Invalid email format']);
    }

    if (sanitized.length > 254) {
      return this.createValidationResult(false, ['Email is too long (max 254 characters)']);
    }

    return this.createValidationResult(true, [], sanitized);
  }

  /**
   * Validate required field
   * @param {*} value - Value to validate
   * @param {string} fieldName - Name of the field for error messages
   * @returns {ValidationResult} Validation result
   */
  static validateRequired(value, fieldName = 'Field') {
    if (value === null || value === undefined || value === '') {
      return this.createValidationResult(false, [`${fieldName} is required`]);
    }

    return this.createValidationResult(true, [], value);
  }

  /**
   * Validate string length
   * @param {string} value - String to validate
   * @param {number} minLength - Minimum length
   * @param {number} maxLength - Maximum length
   * @param {string} fieldName - Field name for error messages
   * @param {boolean} required - Whether field is required
   * @returns {ValidationResult} Validation result
   */
  static validateStringLength(value, minLength = 0, maxLength = 255, fieldName = 'Field', required = true) {
    if (!value) {
      return required 
        ? this.createValidationResult(false, [`${fieldName} is required`])
        : this.createValidationResult(true, [], null);
    }

    if (typeof value !== 'string') {
      return this.createValidationResult(false, [`${fieldName} must be a string`]);
    }

    const sanitized = value.trim();

    if (sanitized.length < minLength) {
      return this.createValidationResult(false, [`${fieldName} must be at least ${minLength} characters long`]);
    }

    if (sanitized.length > maxLength) {
      return this.createValidationResult(false, [`${fieldName} must be no more than ${maxLength} characters long`]);
    }

    return this.createValidationResult(true, [], sanitized);
  }

  /**
   * Validate UUID
   * @param {string} value - UUID to validate
   * @param {string} fieldName - Field name for error messages
   * @param {boolean} required - Whether field is required
   * @returns {ValidationResult} Validation result
   */
  static validateUUID(value, fieldName = 'ID', required = true) {
    if (!value) {
      return required 
        ? this.createValidationResult(false, [`${fieldName} is required`])
        : this.createValidationResult(true, [], null);
    }

    if (typeof value !== 'string') {
      return this.createValidationResult(false, [`${fieldName} must be a string`]);
    }

    const sanitized = value.trim().toLowerCase();

    if (!this.PATTERNS.UUID.test(sanitized)) {
      return this.createValidationResult(false, [`Invalid ${fieldName} format`]);
    }

    return this.createValidationResult(true, [], sanitized);
  }

  /**
   * Validate number within range
   * @param {number} value - Number to validate
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @param {string} fieldName - Field name for error messages
   * @param {boolean} required - Whether field is required
   * @returns {ValidationResult} Validation result
   */
  static validateNumber(value, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, fieldName = 'Number', required = true) {
    if (value === null || value === undefined) {
      return required 
        ? this.createValidationResult(false, [`${fieldName} is required`])
        : this.createValidationResult(true, [], null);
    }

    const num = Number(value);

    if (isNaN(num)) {
      return this.createValidationResult(false, [`${fieldName} must be a valid number`]);
    }

    if (num < min) {
      return this.createValidationResult(false, [`${fieldName} must be at least ${min}`]);
    }

    if (num > max) {
      return this.createValidationResult(false, [`${fieldName} must be no more than ${max}`]);
    }

    return this.createValidationResult(true, [], num);
  }

  /**
   * Validate integer within range
   * @param {number} value - Integer to validate
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @param {string} fieldName - Field name for error messages
   * @param {boolean} required - Whether field is required
   * @returns {ValidationResult} Validation result
   */
  static validateInteger(value, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, fieldName = 'Integer', required = true) {
    const numberValidation = this.validateNumber(value, min, max, fieldName, required);
    
    if (!numberValidation.isValid) {
      return numberValidation;
    }

    if (numberValidation.value !== null && !Number.isInteger(numberValidation.value)) {
      return this.createValidationResult(false, [`${fieldName} must be an integer`]);
    }

    return numberValidation;
  }

  /**
   * Validate date
   * @param {string|Date} value - Date to validate
   * @param {string} fieldName - Field name for error messages
   * @param {boolean} required - Whether field is required
   * @returns {ValidationResult} Validation result
   */
  static validateDate(value, fieldName = 'Date', required = true) {
    if (!value) {
      return required 
        ? this.createValidationResult(false, [`${fieldName} is required`])
        : this.createValidationResult(true, [], null);
    }

    let date;
    
    if (value instanceof Date) {
      date = value;
    } else if (typeof value === 'string') {
      date = new Date(value);
    } else {
      return this.createValidationResult(false, [`${fieldName} must be a valid date`]);
    }

    if (isNaN(date.getTime())) {
      return this.createValidationResult(false, [`${fieldName} must be a valid date`]);
    }

    return this.createValidationResult(true, [], date);
  }

  /**
   * Validate enum value
   * @param {*} value - Value to validate
   * @param {Array} allowedValues - Array of allowed values
   * @param {string} fieldName - Field name for error messages
   * @param {boolean} required - Whether field is required
   * @returns {ValidationResult} Validation result
   */
  static validateEnum(value, allowedValues, fieldName = 'Field', required = true) {
    if (!value) {
      return required 
        ? this.createValidationResult(false, [`${fieldName} is required`])
        : this.createValidationResult(true, [], null);
    }

    if (!allowedValues.includes(value)) {
      return this.createValidationResult(false, [`${fieldName} must be one of: ${allowedValues.join(', ')}`]);
    }

    return this.createValidationResult(true, [], value);
  }

  /**
   * Validate array
   * @param {Array} value - Array to validate
   * @param {number} minLength - Minimum array length
   * @param {number} maxLength - Maximum array length
   * @param {string} fieldName - Field name for error messages
   * @param {boolean} required - Whether field is required
   * @returns {ValidationResult} Validation result
   */
  static validateArray(value, minLength = 0, maxLength = 1000, fieldName = 'Array', required = true) {
    if (!value) {
      return required 
        ? this.createValidationResult(false, [`${fieldName} is required`])
        : this.createValidationResult(true, [], null);
    }

    if (!Array.isArray(value)) {
      return this.createValidationResult(false, [`${fieldName} must be an array`]);
    }

    if (value.length < minLength) {
      return this.createValidationResult(false, [`${fieldName} must have at least ${minLength} items`]);
    }

    if (value.length > maxLength) {
      return this.createValidationResult(false, [`${fieldName} must have no more than ${maxLength} items`]);
    }

    return this.createValidationResult(true, [], value);
  }

  /**
   * Validate phone number
   * @param {string} phone - Phone number to validate
   * @param {boolean} required - Whether phone is required
   * @returns {ValidationResult} Validation result
   */
  static validatePhone(phone, required = true) {
    if (!phone) {
      return required 
        ? this.createValidationResult(false, ['Phone number is required'])
        : this.createValidationResult(true, [], null);
    }

    if (typeof phone !== 'string') {
      return this.createValidationResult(false, ['Phone number must be a string']);
    }

    const sanitized = phone.trim();

    if (!this.PATTERNS.PHONE.test(sanitized)) {
      return this.createValidationResult(false, ['Invalid phone number format']);
    }

    if (sanitized.length > 20) {
      return this.createValidationResult(false, ['Phone number is too long']);
    }

    return this.createValidationResult(true, [], sanitized);
  }

  /**
   * Validate username
   * @param {string} username - Username to validate
   * @param {boolean} required - Whether username is required
   * @returns {ValidationResult} Validation result
   */
  static validateUsername(username, required = true) {
    if (!username) {
      return required 
        ? this.createValidationResult(false, ['Username is required'])
        : this.createValidationResult(true, [], null);
    }

    if (typeof username !== 'string') {
      return this.createValidationResult(false, ['Username must be a string']);
    }

    const sanitized = username.trim();

    if (!this.PATTERNS.USERNAME.test(sanitized)) {
      return this.createValidationResult(false, ['Username must be 3-30 alphanumeric characters']);
    }

    return this.createValidationResult(true, [], sanitized);
  }

  /**
   * Validate object with multiple fields
   * @param {Object} data - Data object to validate
   * @param {Object} validators - Object with field names as keys and validator functions as values
   * @returns {ValidationResult} Validation result
   */
  static validateObject(data, validators) {
    if (!data || typeof data !== 'object') {
      return this.createValidationResult(false, ['Data must be an object']);
    }

    const errors = [];
    const validatedData = {};

    for (const [field, validator] of Object.entries(validators)) {
      const result = validator(data[field]);
      
      if (!result.isValid) {
        errors.push(...result.errors.map(error => `${field}: ${error}`));
      } else if (result.value !== null && result.value !== undefined) {
        validatedData[field] = result.value;
      }
    }

    if (errors.length > 0) {
      return this.createValidationResult(false, errors);
    }

    return this.createValidationResult(true, [], validatedData);
  }

  /**
   * Validate pagination parameters
   * @param {Object} params - Pagination parameters
   * @returns {ValidationResult} Validation result
   */
  static validatePagination(params = {}) {
    const validators = {
      limit: (value) => this.validateInteger(value, 1, 100, 'Limit', false) || { isValid: true, value: 20 },
      offset: (value) => this.validateInteger(value, 0, Number.MAX_SAFE_INTEGER, 'Offset', false) || { isValid: true, value: 0 },
      lastEvaluatedKey: (value) => this.validateStringLength(value, 1, 1000, 'LastEvaluatedKey', false)
    };

    return this.validateObject(params, validators);
  }

  /**
   * Sanitize input by removing potentially harmful characters
   * @param {string} input - Input to sanitize
   * @returns {string} Sanitized input
   */
  static sanitizeInput(input) {
    if (typeof input !== 'string') {
      return input;
    }

    return input
      .trim()
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .substring(0, 10000); // Limit length to prevent DoS
  }

  /**
   * Sanitize HTML by removing all HTML tags
   * @param {string} input - Input to sanitize
   * @returns {string} Sanitized input
   */
  static sanitizeHtml(input) {
    if (typeof input !== 'string') {
      return input;
    }

    return input.replace(/<[^>]*>/g, '').trim();
  }
}

export default ValidationHelper;

// Export for backward compatibility and convenience
export const {
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
  PATTERNS
} = ValidationHelper;