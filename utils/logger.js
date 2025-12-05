/**
 * Logger utility for consistent, color-coded console output
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  
  // Foreground colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

function formatMessage(level, message, color) {
  const timestamp = new Date().toISOString();
  const levelStr = `[${level}]`.padEnd(8);
  return `${colors.gray}${timestamp}${colors.reset} ${color}${levelStr}${colors.reset} ${message}`;
}

const logger = {
  info(message) {
    console.log(formatMessage('INFO', message, colors.blue));
  },

  success(message) {
    console.log(formatMessage('SUCCESS', message, colors.green));
  },

  warn(message) {
    console.log(formatMessage('WARN', message, colors.yellow));
  },

  error(message) {
    console.error(formatMessage('ERROR', message, colors.red));
  },

  debug(message) {
    console.log(formatMessage('DEBUG', message, colors.gray));
  },

  section(title) {
    console.log(`\n${colors.bright}${colors.cyan}=== ${title} ===${colors.reset}\n`);
  },

  step(message) {
    console.log(`${colors.magenta}→${colors.reset} ${message}`);
  }
};

export default logger;
