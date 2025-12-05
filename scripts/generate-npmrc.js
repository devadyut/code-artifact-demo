/**
 * npmrc File Generator
 * 
 * Generates .npmrc files for consumer applications with CodeArtifact
 * registry configuration and authentication tokens.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

import { promises as fs } from 'fs';
import path from 'path';
import logger from '../utils/logger.js';

/**
 * Formats npmrc content with registry URL and authentication token
 * 
 * @param {string} registryUrl - CodeArtifact registry URL
 * @param {string} authToken - Authorization token
 * @param {string} scope - Package scope (e.g., '@myorg')
 * @returns {string} Formatted npmrc content
 * 
 * Requirements: 4.1, 4.2
 */
function formatNpmrcContent(registryUrl, authToken, scope) {
  // Ensure scope starts with @
  const normalizedScope = scope.startsWith('@') ? scope : `@${scope}`;
  
  // Extract registry host from URL for auth configuration
  const registryHost = registryUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  
  return [
    `# AWS CodeArtifact Registry Configuration`,
    `# Generated: ${new Date().toISOString()}`,
    ``,
    `# Registry URL for scoped packages`,
    `${normalizedScope}:registry=${registryUrl}`,
    ``,
    `# Authentication token`,
    `//${registryHost}/:always-auth=true`,
    `//${registryHost}/:_authToken=${authToken}`,
    ``
  ].join('\n');
}

/**
 * Backs up existing .npmrc file if it exists
 * 
 * @param {string} targetDir - Directory containing .npmrc
 * @returns {Promise<boolean>} True if backup was created, false if no file existed
 * 
 * Requirements: 4.5
 */
async function backupExistingNpmrc(targetDir) {
  const npmrcPath = path.join(targetDir, '.npmrc');
  
  try {
    await fs.access(npmrcPath);
    
    // File exists, create backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(targetDir, `.npmrc.backup.${timestamp}`);
    
    await fs.copyFile(npmrcPath, backupPath);
    logger.info(`Backed up existing .npmrc to ${path.basename(backupPath)}`);
    
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, no backup needed
      return false;
    }
    throw error;
  }
}

/**
 * Generates .npmrc file in target directory
 * 
 * @param {string} targetDir - Directory where .npmrc should be created
 * @param {string} registryUrl - CodeArtifact registry URL
 * @param {string} authToken - Authorization token
 * @param {string} scope - Package scope
 * @returns {Promise<void>}
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */
async function generateNpmrc(targetDir, registryUrl, authToken, scope) {
  try {
    // Verify target directory exists
    await fs.access(targetDir);
  } catch (error) {
    throw new Error(`Target directory does not exist: ${targetDir}`);
  }
  
  // Backup existing .npmrc if present (Requirement 4.5)
  await backupExistingNpmrc(targetDir);
  
  // Format npmrc content (Requirements 4.1, 4.2)
  const content = formatNpmrcContent(registryUrl, authToken, scope);
  
  // Write .npmrc file (Requirements 4.3, 4.4)
  const npmrcPath = path.join(targetDir, '.npmrc');
  await fs.writeFile(npmrcPath, content, { encoding: 'utf8' });
  
  // Set file permissions to 0600 for security (Requirement 4.6)
  await fs.chmod(npmrcPath, 0o600);
  
  logger.success(`Generated .npmrc in ${targetDir}`);
}

export {
  formatNpmrcContent,
  backupExistingNpmrc,
  generateNpmrc
};
