#!/usr/bin/env node

/**
 * CodeArtifact Auth Token Generator
 * 
 * Generates fresh CodeArtifact authentication tokens and updates .npmrc files
 * in target directories (my-api/core, my-api/auth, my-ui)
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';
import AWSCodeArtifactClient from '../utils/aws-client.js';
import { generateNpmrc } from './generate-npmrc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load configuration from codeartifact-config.json
 */
async function loadConfiguration() {
  try {
    const configPath = path.join(__dirname, '..', 'codeartifact-config.json');
    const configContent = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configContent);
    
    // Resolve AWS_ACCOUNT_ID if needed
    if (config.aws.accountId === '${AWS_ACCOUNT_ID}' && !process.env.AWS_ACCOUNT_ID) {
      const { STSClient, GetCallerIdentityCommand } = await import('@aws-sdk/client-sts');
      const client = new STSClient({});
      const response = await client.send(new GetCallerIdentityCommand({}));
      config.aws.accountId = response.Account;
    } else if (config.aws.accountId === '${AWS_ACCOUNT_ID}') {
      config.aws.accountId = process.env.AWS_ACCOUNT_ID;
    }
    
    return config;
  } catch (error) {
    throw new Error(`Failed to load configuration: ${error.message}`);
  }
}

/**
 * Main execution function
 */
async function main() {
  try {
    logger.section('CodeArtifact Auth Token Generator');
    
    // Load configuration
    logger.step('Loading configuration...');
    const config = await loadConfiguration();
    logger.success('Configuration loaded');
    
    // Initialize AWS client
    const client = new AWSCodeArtifactClient(config.aws.region, config.aws.accountId);
    
    // Generate fresh token
    logger.step('Generating fresh authentication token...');
    const tokenResult = await client.getAuthorizationToken(
      config.codeartifact.domain,
      43200 // 12 hours
    );
    
    if (!tokenResult.authorizationToken) {
      throw new Error('Failed to generate authorization token');
    }
    
    logger.success('Token generated successfully');
    logger.info(`Token expires: ${new Date(tokenResult.expiration).toLocaleString()}`);
    
    // Get repository endpoint
    logger.step('Getting repository endpoint...');
    const registryUrl = await client.getRepositoryEndpoint(
      config.codeartifact.domain,
      config.codeartifact.repository,
      'npm'
    );
    
    // Update .npmrc files in target directories
    logger.section('Updating .npmrc files');
    
    const targetDirs = config.paths.consumers;
    const results = [];
    
    for (const targetDir of targetDirs) {
      const absolutePath = path.join(__dirname, '..', targetDir);
      
      try {
        logger.step(`Updating ${targetDir}...`);
        
        // Create directory if it doesn't exist
        await fs.mkdir(absolutePath, { recursive: true });
        
        // Generate .npmrc file
        await generateNpmrc(
          absolutePath,
          registryUrl,
          tokenResult.authorizationToken,
          config.codeartifact.scope
        );
        
        results.push({ path: targetDir, success: true });
      } catch (error) {
        logger.error(`Failed to update ${targetDir}: ${error.message}`);
        results.push({ path: targetDir, success: false, error: error.message });
      }
    }
    
    // Display summary
    logger.section('Summary');
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    logger.info(`Successfully updated: ${successful.length} directories`);
    successful.forEach(r => logger.info(`  ✓ ${r.path}`));
    
    if (failed.length > 0) {
      logger.info(`Failed to update: ${failed.length} directories`);
      failed.forEach(r => logger.info(`  ✗ ${r.path}: ${r.error}`));
    }
    
    logger.success('Auth token generation completed!');
    process.exit(0);
    
  } catch (error) {
    logger.error('Token generation failed!');
    logger.error(error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main };