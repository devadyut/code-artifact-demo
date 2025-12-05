#!/usr/bin/env node

/**
 * AWS CodeArtifact Setup Orchestration Script
 * 
 * Main script that orchestrates the complete CodeArtifact setup:
 * 1. Create infrastructure (domain, repository, external connection)
 * 2. Publish packages to CodeArtifact
 * 3. Generate .npmrc files for consumer applications
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.4, 6.5
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import logger from '../utils/logger.js';
import AWSCodeArtifactClient from '../utils/aws-client.js';
import { createInfrastructure } from './create-infrastructure.js';
import { generateNpmrc } from './generate-npmrc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get AWS Account ID from STS GetCallerIdentity
 * 
 * @returns {Promise<string>} AWS Account ID
 */
async function getAwsAccountId() {
  try {
    const { STSClient, GetCallerIdentityCommand } = await import('@aws-sdk/client-sts');
    const client = new STSClient({});
    const response = await client.send(new GetCallerIdentityCommand({}));
    return response.Account;
  } catch (error) {
    throw new Error(`Failed to retrieve AWS Account ID: ${error.message}`);
  }
}

/**
 * Resolve environment variables in a string
 * Supports ${VAR_NAME} syntax
 * 
 * @param {string} str - String potentially containing environment variables
 * @param {Object} additionalVars - Additional variables to use for resolution
 * @returns {string} String with environment variables resolved
 */
function resolveEnvVars(str, additionalVars = {}) {
  if (typeof str !== 'string') return str;
  
  return str.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    // Check additional vars first, then environment variables
    const value = additionalVars[varName] ?? process.env[varName];
    if (value === undefined) {
      throw new Error(`Environment variable ${varName} is not set`);
    }
    return value;
  });
}

/**
 * Recursively resolve environment variables in an object
 * 
 * @param {Object} obj - Object to process
 * @param {Object} additionalVars - Additional variables to use for resolution
 * @returns {Object} Object with environment variables resolved
 */
function resolveEnvVarsInObject(obj, additionalVars = {}) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => 
      typeof item === 'string' ? resolveEnvVars(item, additionalVars) : resolveEnvVarsInObject(item, additionalVars)
    );
  }
  
  const resolved = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      resolved[key] = resolveEnvVars(value, additionalVars);
    } else if (typeof value === 'object') {
      resolved[key] = resolveEnvVarsInObject(value, additionalVars);
    } else {
      resolved[key] = value;
    }
  }
  
  return resolved;
}

/**
 * Load configuration from codeartifact-config.json
 * Resolves environment variables in the format ${VAR_NAME}
 * Automatically retrieves AWS Account ID if not provided
 * 
 * @returns {Promise<Object>} Configuration object
 * @throws {Error} If configuration file is missing or invalid
 */
async function loadConfiguration() {
  try {
    const configPath = path.join(__dirname, '..', 'codeartifact-config.json');
    const configContent = await fs.readFile(configPath, 'utf8');
    const rawConfig = JSON.parse(configContent);
    
    // Check if AWS_ACCOUNT_ID is needed but not set
    const needsAccountId = configContent.includes('${AWS_ACCOUNT_ID}') && !process.env.AWS_ACCOUNT_ID;
    
    let additionalVars = {};
    
    if (needsAccountId) {
      logger.step('AWS_ACCOUNT_ID not set, retrieving from AWS credentials...');
      try {
        const accountId = await getAwsAccountId();
        additionalVars.AWS_ACCOUNT_ID = accountId;
        // Also set it in process.env for consistency
        process.env.AWS_ACCOUNT_ID = accountId;
        logger.success(`Retrieved AWS Account ID: ${accountId}`);
      } catch (error) {
        throw new Error(`Failed to retrieve AWS Account ID. Please set AWS_ACCOUNT_ID environment variable or configure AWS credentials. Error: ${error.message}`);
      }
    }
    
    // Resolve environment variables in configuration
    const config = resolveEnvVarsInObject(rawConfig, additionalVars);
    
    // Validate required configuration fields
    if (!config.aws?.region || !config.aws?.accountId) {
      throw new Error('Missing required AWS configuration (region, accountId)');
    }
    
    if (!config.codeartifact?.domain || !config.codeartifact?.repository) {
      throw new Error('Missing required CodeArtifact configuration (domain, repository)');
    }
    
    if (!config.codeartifact?.scope) {
      throw new Error('Missing required package scope in configuration');
    }
    
    if (!config.paths?.sharedLibs) {
      throw new Error('Missing required shared libraries path in configuration');
    }
    
    if (!config.paths?.consumers || !Array.isArray(config.paths.consumers)) {
      throw new Error('Missing or invalid consumer applications paths in configuration');
    }
    
    return config;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('Configuration file not found: codeartifact-config.json');
    }
    
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in configuration file: ${error.message}`);
    }
    
    throw error;
  }
}

/**
 * Execute the complete setup process
 * 
 * @param {Object} config - Configuration object
 * @returns {Promise<Object>} Setup results summary
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.4, 6.5
 */
async function executeSetup(config) {
  const results = {
    infrastructure: null,
    publishing: null,
    npmrcGeneration: null,
    errors: [],
  };
  
  try {
    // Step 1: Create infrastructure (domain, repository, external connection)
    // Requirement 5.1: Execute domain and repository creation before publishing
    logger.section('Step 1: Creating CodeArtifact Infrastructure');
    results.infrastructure = await createInfrastructure(config);
    
    if (!results.infrastructure.success) {
      throw new Error('Infrastructure creation failed');
    }
    
    // Step 2: Generate authorization token
    // Requirement 5.2: Generate authorization tokens before creating npmrc files
    // Requirement 6.4: Regenerate authorization tokens on re-run
    logger.section('Step 2: Generating Authorization Token');
    const client = new AWSCodeArtifactClient(config.aws.region, config.aws.accountId);
    
    logger.step('Requesting authorization token...');
    const tokenResult = await client.getAuthorizationToken(
      config.codeartifact.domain,
      43200 // 12 hours
    );
    
    if (!tokenResult.authorizationToken) {
      throw new Error('Failed to generate authorization token');
    }
    
    logger.success('Authorization token generated successfully');
    logger.info(`Token expires: ${new Date(tokenResult.expiration).toLocaleString()}`);
    
    // Get repository endpoint URL
    logger.step('Retrieving repository endpoint...');
    const registryUrl = await client.getRepositoryEndpoint(
      config.codeartifact.domain,
      config.codeartifact.repository,
      'npm'
    );
    
    logger.success(`Registry URL: ${registryUrl}`);
    
    // Step 3: Publish packages
    // Requirement 5.3: Publish packages before configuring consumer applications
    logger.section('Step 3: Publishing Packages to CodeArtifact');
    
    const publishScriptPath = path.join(
      __dirname,
      '..',
      config.paths.sharedLibs,
      'scripts',
      'publish-packages.js'
    );
    
    // Verify publish script exists
    try {
      await fs.access(publishScriptPath);
    } catch (error) {
      throw new Error(`Publish script not found: ${publishScriptPath}`);
    }
    
    logger.step('Running publish script...');
    
    try {
      // Execute publish script with registry URL and auth token
      execSync(
        `node "${publishScriptPath}" all "${registryUrl}" "${tokenResult.authorizationToken}"`,
        {
          stdio: 'inherit',
          cwd: path.join(__dirname, '..'),
        }
      );
      
      results.publishing = {
        success: true,
        message: 'Packages published successfully',
      };
      
      logger.success('Package publishing completed');
    } catch (error) {
      // Publishing script handles its own error reporting
      throw new Error(`Package publishing failed: ${error.message}`);
    }
    
    // Step 4: Generate .npmrc files for consumer applications
    // Requirement 5.2: Token generation before npmrc creation (already done)
    // Requirement 6.5: Update npmrc files with fresh authorization tokens
    logger.section('Step 4: Generating .npmrc Files for Consumer Applications');
    
    const npmrcResults = [];
    
    for (const consumerPath of config.paths.consumers) {
      const absolutePath = path.join(__dirname, '..', consumerPath);
      
      try {
        // Verify consumer directory exists
        await fs.access(absolutePath);
        
        logger.step(`Generating .npmrc for ${consumerPath}...`);
        
        await generateNpmrc(
          absolutePath,
          registryUrl,
          tokenResult.authorizationToken,
          config.codeartifact.scope
        );
        
        npmrcResults.push({
          path: consumerPath,
          success: true,
        });
      } catch (error) {
        logger.error(`Failed to generate .npmrc for ${consumerPath}: ${error.message}`);
        npmrcResults.push({
          path: consumerPath,
          success: false,
          error: error.message,
        });
      }
    }
    
    results.npmrcGeneration = {
      success: npmrcResults.every(r => r.success),
      results: npmrcResults,
      totalGenerated: npmrcResults.filter(r => r.success).length,
      totalFailed: npmrcResults.filter(r => !r.success).length,
    };
    
    if (results.npmrcGeneration.totalFailed > 0) {
      logger.warning(`Failed to generate ${results.npmrcGeneration.totalFailed} .npmrc file(s)`);
    }
    
    return results;
  } catch (error) {
    results.errors.push(error.message);
    throw error;
  }
}

/**
 * Display summary of completed actions
 * 
 * @param {Object} results - Setup results object
 * 
 * Requirement 5.5: Display summary of completed actions on success
 */
function displaySummary(results) {
  logger.section('Setup Summary');
  
  // Infrastructure summary
  if (results.infrastructure) {
    logger.info('Infrastructure:');
    
    if (results.infrastructure.domain) {
      const domainStatus = results.infrastructure.domain.created ? 'Created' : 'Already exists';
      logger.info(`  ✓ Domain: ${domainStatus}`);
    }
    
    if (results.infrastructure.repository) {
      const repoStatus = results.infrastructure.repository.created ? 'Created' : 'Already exists';
      logger.info(`  ✓ Repository: ${repoStatus}`);
    }
    
    if (results.infrastructure.externalConnection) {
      const connStatus = results.infrastructure.externalConnection.created ? 'Associated' : 'Already associated';
      logger.info(`  ✓ External Connection: ${connStatus}`);
    }
  }
  
  // Publishing summary
  if (results.publishing) {
    logger.info('Package Publishing:');
    logger.info(`  ✓ ${results.publishing.message}`);
  }
  
  // npmrc generation summary
  if (results.npmrcGeneration) {
    logger.info('.npmrc Generation:');
    logger.info(`  ✓ Generated: ${results.npmrcGeneration.totalGenerated} file(s)`);
    
    if (results.npmrcGeneration.totalFailed > 0) {
      logger.info(`  ✗ Failed: ${results.npmrcGeneration.totalFailed} file(s)`);
    }
  }
  
  logger.success('Setup completed successfully!');
}

/**
 * Main entry point
 * 
 * Requirements: 5.4, 5.5
 */
async function main() {
  try {
    logger.section('AWS CodeArtifact Setup');
    
    // Step 0: Install dependencies (important for CI/CD environments)
    logger.section('Step 0: Installing Dependencies');
    logger.step('Running npm install...');
    
    try {
      execSync('npm install', {
        stdio: 'inherit',
        cwd: path.join(__dirname, '..'),
      });
      logger.success('Dependencies installed successfully');
    } catch (error) {
      logger.warning('npm install failed, continuing anyway (dependencies may already be installed)');
    }
    
    // Load configuration
    logger.step('Loading configuration...');
    const config = await loadConfiguration();
    logger.success('Configuration loaded successfully');
    
    // Execute setup
    const results = await executeSetup(config);
    
    // Display summary
    // Requirement 5.5: Display summary on success and exit with code zero
    displaySummary(results);
    
    process.exit(0);
  } catch (error) {
    // Requirement 5.4: Report failure and halt execution with non-zero exit code
    logger.error('Setup failed!');
    logger.error(error.message);
    
    if (error.stack && process.env.DEBUG) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    
    process.exit(1);
  }
}

// Run main function if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  loadConfiguration,
  executeSetup,
  displaySummary,
  main,
};
