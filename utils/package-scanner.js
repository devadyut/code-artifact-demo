/**
 * Package scanner utility for discovering and validating packages in my-lib directory
 */

import fs from 'fs';
import path from 'path';
import logger from './logger.js';

/**
 * Recursively finds all package.json files in a directory
 * @param {string} rootDirectory - Root directory to search
 * @returns {string[]} Array of absolute paths to package.json files
 */
function findPackages(rootDirectory) {
  const packages = [];
  
  function scanDirectory(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Skip node_modules and hidden directories
          if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
            continue;
          }
          scanDirectory(fullPath);
        } else if (entry.isFile() && entry.name === 'package.json') {
          packages.push(fullPath);
        }
      }
    } catch (error) {
      logger.warn(`Failed to scan directory ${dir}: ${error.message}`);
    }
  }
  
  scanDirectory(rootDirectory);
  return packages;
}

/**
 * Validates a package.json file
 * @param {string} packagePath - Path to package.json file
 * @returns {boolean} True if valid, false otherwise
 */
function validatePackageJson(packagePath) {
  try {
    const content = fs.readFileSync(packagePath, 'utf8');
    const packageJson = JSON.parse(content);
    
    // Check for required fields
    if (!packageJson.name || typeof packageJson.name !== 'string') {
      logger.debug(`Invalid package at ${packagePath}: missing or invalid 'name' field`);
      return false;
    }
    
    if (!packageJson.version || typeof packageJson.version !== 'string') {
      logger.debug(`Invalid package at ${packagePath}: missing or invalid 'version' field`);
      return false;
    }
    
    // Validate version format (basic semver check)
    const versionRegex = /^\d+\.\d+\.\d+/;
    if (!versionRegex.test(packageJson.version)) {
      logger.debug(`Invalid package at ${packagePath}: invalid version format '${packageJson.version}'`);
      return false;
    }
    
    return true;
  } catch (error) {
    logger.debug(`Failed to validate package at ${packagePath}: ${error.message}`);
    return false;
  }
}

/**
 * Gets package information from a package.json file
 * @param {string} packagePath - Path to package.json file
 * @returns {Object|null} Package info object or null if invalid
 */
function getPackageInfo(packagePath) {
  try {
    const content = fs.readFileSync(packagePath, 'utf8');
    const packageJson = JSON.parse(content);
    const valid = validatePackageJson(packagePath);
    
    return {
      name: packageJson.name || null,
      version: packageJson.version || null,
      path: path.dirname(packagePath),
      valid
    };
  } catch (error) {
    logger.debug(`Failed to read package info from ${packagePath}: ${error.message}`);
    return {
      name: null,
      version: null,
      path: path.dirname(packagePath),
      valid: false
    };
  }
}

export { findPackages, validatePackageJson, getPackageInfo };
