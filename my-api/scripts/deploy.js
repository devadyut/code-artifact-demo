#!/usr/bin/env node

/**
 * Serverless API Deployment Script
 * 
 * Compatible with:
 * - AWS SDK v3 (prioritizes direct credentials over profiles)
 * - Node.js 22+
 * - Serverless Framework v4
 * 
 * Credential Priority (updated for production compatibility):
 * 1. AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY (recommended for all environments)
 * 2. AWS_PROFILE (fallback for dev/uat only, not supported in production)
 * 
 * Required Environment Variables:
 * - AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (production required, recommended for all)
 * - AWS_REGION or AWS_DEFAULT_REGION
 * - SERVERLESS_ACCESS_KEY (Serverless Framework v4 authentication)
 */

import { discoverModules, executeCommand, logWithColor } from './utils.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

/**
 * Deploy all Lambda modules to specified environment
 * Supports dev, prod, and uat stages with dev as default
 */
class DeploymentManager {
    constructor(stage = 'dev') {
        this.stage = stage;
        this.deploymentResults = [];
        this.startTime = Date.now();
        this.deploymentStateFile = path.join(process.cwd(), '.kiro', 'deployment-state.json');
        this.ensureStateDirectory();
    }

    /**
     * Ensure the .kiro directory exists for storing deployment state
     */
    ensureStateDirectory() {
        const kiroDir = path.join(process.cwd(), '.kiro');
        if (!fs.existsSync(kiroDir)) {
            fs.mkdirSync(kiroDir, { recursive: true });
        }
    }

    /**
     * Load previous deployment state
     */
    loadDeploymentState() {
        try {
            if (fs.existsSync(this.deploymentStateFile)) {
                const state = JSON.parse(fs.readFileSync(this.deploymentStateFile, 'utf8'));
                return state[this.stage] || {};
            }
        } catch (error) {
            logWithColor(`⚠️  Could not load deployment state: ${error.message}`, 'yellow');
        }
        return {};
    }

    /**
     * Save deployment state
     */
    saveDeploymentState(moduleStates) {
        try {
            let allStates = {};
            if (fs.existsSync(this.deploymentStateFile)) {
                allStates = JSON.parse(fs.readFileSync(this.deploymentStateFile, 'utf8'));
            }

            allStates[this.stage] = moduleStates;
            fs.writeFileSync(this.deploymentStateFile, JSON.stringify(allStates, null, 2));
        } catch (error) {
            logWithColor(`⚠️  Could not save deployment state: ${error.message}`, 'yellow');
        }
    }

    /**
     * Calculate hash of module files to detect changes
     */
    calculateModuleHash(modulePath) {
        const hash = crypto.createHash('sha256');
        const filesToHash = [];

        try {
            // Get all relevant files for the module
            const files = this.getModuleFiles(modulePath);
            files.sort(); // Ensure consistent ordering

            for (const file of files) {
                const filePath = path.join(modulePath, file);
                if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                    const content = fs.readFileSync(filePath);
                    hash.update(file); // Include filename
                    hash.update(content);
                    filesToHash.push(file);
                }
            }

            return {
                hash: hash.digest('hex'),
                files: filesToHash
            };
        } catch (error) {
            logWithColor(`⚠️  Error calculating hash for ${modulePath}: ${error.message}`, 'yellow');
            return { hash: Date.now().toString(), files: [] };
        }
    }

    /**
     * Get list of files to include in change detection
     */
    getModuleFiles(modulePath) {
        const files = [];
        const excludePatterns = [
            'node_modules',
            '.git',
            '.serverless',
            'coverage',
            '*.log',
            '.env.local',
            '.DS_Store'
        ];

        const walkDir = (dir, relativePath = '') => {
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });

                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    const relativeFilePath = path.join(relativePath, entry.name);

                    // Skip excluded patterns
                    if (excludePatterns.some(pattern =>
                        entry.name.includes(pattern.replace('*', '')) ||
                        relativeFilePath.includes(pattern.replace('*', ''))
                    )) {
                        continue;
                    }

                    if (entry.isDirectory()) {
                        walkDir(fullPath, relativeFilePath);
                    } else {
                        files.push(relativeFilePath);
                    }
                }
            } catch (error) {
                // Skip directories we can't read
            }
        };

        walkDir(modulePath);
        return files;
    }

    /**
     * Check if module has changes using Git (for production workflow)
     */
    hasGitChanges(modulePath, lastCommit) {
        try {
            if (!lastCommit) return true;

            // Get the relative path from repo root
            const repoRoot = executeCommand('git rev-parse --show-toplevel', process.cwd(), true);
            if (!repoRoot.success) return true;

            const relativePath = path.relative(repoRoot.output.trim(), modulePath);

            // Check if there are changes in this module since last deployment
            const gitDiff = executeCommand(
                `git diff --name-only ${lastCommit} HEAD -- ${relativePath}`,
                process.cwd(),
                true
            );

            if (gitDiff.success) {
                const changedFiles = gitDiff.output.trim().split('\n').filter(f => f.length > 0);
                return changedFiles.length > 0;
            }
        } catch (error) {
            logWithColor(`⚠️  Git change detection failed for ${modulePath}: ${error.message}`, 'yellow');
        }

        return true; // Deploy if we can't determine changes
    }

    /**
     * Get current Git commit hash
     */
    getCurrentGitCommit() {
        try {
            const result = executeCommand('git rev-parse HEAD', process.cwd(), true);
            return result.success ? result.output.trim() : null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Determine if module needs deployment
     */
    needsDeployment(module, previousState) {
        const moduleName = module.name;
        const previousModuleState = previousState[moduleName];

        // Always deploy if no previous state
        if (!previousModuleState) {
            logWithColor(`  📦 ${moduleName}: No previous deployment found`, 'blue');
            return { needsDeployment: true, reason: 'first-deployment' };
        }

        // For production, use Git-based change detection
        if (this.stage === 'prod') {
            const currentCommit = this.getCurrentGitCommit();
            const lastDeployedCommit = previousModuleState.gitCommit;

            if (!currentCommit) {
                logWithColor(`  📦 ${moduleName}: Git not available, deploying`, 'yellow');
                return { needsDeployment: true, reason: 'no-git' };
            }

            if (currentCommit !== lastDeployedCommit) {
                const hasChanges = this.hasGitChanges(module.path, lastDeployedCommit);
                if (hasChanges) {
                    logWithColor(`  📦 ${moduleName}: Git changes detected since ${lastDeployedCommit?.substring(0, 8)}`, 'blue');
                    return { needsDeployment: true, reason: 'git-changes' };
                } else {
                    logWithColor(`  📦 ${moduleName}: No changes since last deployment`, 'green');
                    return { needsDeployment: false, reason: 'no-git-changes' };
                }
            } else {
                logWithColor(`  📦 ${moduleName}: Same commit as last deployment`, 'green');
                return { needsDeployment: false, reason: 'same-commit' };
            }
        }

        // For dev, use file hash-based change detection
        const currentHash = this.calculateModuleHash(module.path);
        const previousHash = previousModuleState.fileHash;

        if (currentHash.hash !== previousHash) {
            logWithColor(`  📦 ${moduleName}: File changes detected`, 'blue');
            return { needsDeployment: true, reason: 'file-changes' };
        } else {
            logWithColor(`  📦 ${moduleName}: No changes detected`, 'green');
            return { needsDeployment: false, reason: 'no-changes' };
        }
    }

    /**
     * Validate deployment environment and prerequisites
     */
    validateDeploymentEnvironment() {
        logWithColor(`\n🔍 Validating deployment environment for stage: ${this.stage}`, 'cyan');

        // Determine if this is a development or production environment
        const isDevelopmentEnvironment = this.stage === 'dev' || this.stage === 'uat';
        const isProductionEnvironment = this.stage === 'prod';

        // Check AWS credentials - prioritize direct credentials over profiles
        const hasDirectCredentials = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;
        const hasProfile = process.env.AWS_PROFILE;

        // Validate that both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are present if one is provided
        if (process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_SECRET_ACCESS_KEY) {
            logWithColor('\n❌ AWS_ACCESS_KEY_ID is set but AWS_SECRET_ACCESS_KEY is missing', 'red');
            logWithColor('Both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be provided together', 'yellow');
            return false;
        }
        if (process.env.AWS_SECRET_ACCESS_KEY && !process.env.AWS_ACCESS_KEY_ID) {
            logWithColor('\n❌ AWS_SECRET_ACCESS_KEY is set but AWS_ACCESS_KEY_ID is missing', 'red');
            logWithColor('Both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be provided together', 'yellow');
            return false;
        }

        // Credential priority: direct credentials over AWS profiles
        if (hasDirectCredentials) {
            logWithColor('✅ Using direct AWS credentials (AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY)', 'green');
            if (isDevelopmentEnvironment) {
                logWithColor('💡 Direct credentials detected in development environment - excellent for consistency!', 'blue');
            }
        } else if (hasProfile && isDevelopmentEnvironment) {
            // Allow profile fallback for development environments (dev, uat)
            logWithColor(`✅ Using AWS Profile: ${process.env.AWS_PROFILE}`, 'green');
            logWithColor('💡 Consider using direct credentials (AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY) for consistency across environments', 'yellow');
        } else {
            // No valid credentials found
            logWithColor('\n❌ AWS credentials not configured properly', 'red');
            logWithColor('Please ensure AWS credentials are set via:', 'yellow');
            
            if (isProductionEnvironment) {
                logWithColor('  Production deployment (required):', 'cyan');
                logWithColor('    - AWS_ACCESS_KEY_ID=your_access_key', 'blue');
                logWithColor('    - AWS_SECRET_ACCESS_KEY=your_secret_key', 'blue');
                logWithColor('  CI/CD (GitHub Actions):', 'cyan');
                logWithColor('    - Add AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY as GitHub secrets', 'blue');
                logWithColor('\n⚠️  AWS_PROFILE is not supported for production deployments', 'yellow');
            } else {
                logWithColor('  Recommended (all environments):', 'cyan');
                logWithColor('    - AWS_ACCESS_KEY_ID=your_access_key', 'blue');
                logWithColor('    - AWS_SECRET_ACCESS_KEY=your_secret_key', 'blue');
                logWithColor('  Alternative (development environments only):', 'cyan');
                logWithColor('    - AWS_PROFILE=myapp', 'blue');
                logWithColor('    - AWS CLI configuration (~/.aws/credentials)', 'blue');
            }
            return false;
        }

        // Validate AWS region is set (required for AWS SDK v3)
        const hasRegion = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
        if (!hasRegion) {
            logWithColor('\n❌ AWS region not configured', 'red');
            logWithColor('Please set AWS region via:', 'yellow');
            logWithColor('  Environment variable:', 'cyan');
            logWithColor('    - AWS_REGION=us-east-1', 'blue');
            logWithColor('    - AWS_DEFAULT_REGION=us-east-1', 'blue');
            logWithColor('  CI/CD (GitHub Actions):', 'cyan');
            logWithColor('    - Add AWS_REGION to GitHub Secrets or workflow environment', 'blue');
            return false;
        } else {
            logWithColor(`✅ AWS Region configured: ${hasRegion}`, 'green');
        }

        // Check Serverless Framework authentication for v4
        const hasServerlessAccessKey = process.env.SERVERLESS_ACCESS_KEY;
        if (!hasServerlessAccessKey) {
            logWithColor('\n❌ Serverless Framework v4 authentication not configured', 'red');
            logWithColor('Serverless Framework v4 requires authentication for deployments.', 'yellow');
            logWithColor('Please ensure SERVERLESS_ACCESS_KEY is set:', 'yellow');
            logWithColor('  Local development:', 'cyan');
            logWithColor('    - SERVERLESS_ACCESS_KEY=your_access_key', 'blue');
            logWithColor('    - Get your access key from: https://app.serverless.com/', 'blue');
            logWithColor('  CI/CD (GitHub Actions):', 'cyan');
            logWithColor('    - Add SERVERLESS_ACCESS_KEY to GitHub Secrets', 'blue');
            logWithColor('\n💡 This is required for AWS SDK v3 compatibility with Serverless Framework v4', 'blue');
            return false;
        } else {
            logWithColor('✅ Serverless Framework v4 access key configured', 'green');
        }

        // Validate stage parameter
        const validStages = ['dev', 'prod'];
        if (!validStages.includes(this.stage)) {
            logWithColor(`\n❌ Invalid stage: ${this.stage}`, 'red');
            logWithColor(`Valid stages are: ${validStages.join(', ')}`, 'yellow');
            return false;
        }

        // Check if serverless CLI is available and compatible
        const serverlessCheck = executeCommand('serverless --version', process.cwd(), true);
        if (!serverlessCheck.success) {
            logWithColor('\n❌ Serverless Framework not found', 'red');
            logWithColor('Please install Serverless Framework v4 globally:', 'yellow');
            logWithColor('  npm install -g serverless@4', 'blue');
            logWithColor('\n💡 Serverless Framework v4 is required for AWS SDK v3 and Node.js 22 compatibility', 'blue');
            return false;
        } else {
            // Extract version information for compatibility check
            const versionOutput = serverlessCheck.output;
            if (versionOutput && versionOutput.includes('Framework Core:')) {
                const versionMatch = versionOutput.match(/Framework Core: (\d+)\./);
                if (versionMatch) {
                    const majorVersion = parseInt(versionMatch[1]);
                    if (majorVersion < 4) {
                        logWithColor('\n⚠️  Serverless Framework v3 or older detected', 'yellow');
                        logWithColor('For optimal AWS SDK v3 and Node.js 22 compatibility, consider upgrading:', 'yellow');
                        logWithColor('  npm install -g serverless@4', 'blue');
                    } else {
                        logWithColor(`✅ Serverless Framework v${majorVersion} detected (AWS SDK v3 compatible)`, 'green');
                    }
                }
            }
        }

        // Authenticate with Serverless Framework v4
        logWithColor('\n🔐 Authenticating with Serverless Framework...', 'cyan');
        const loginResult = executeCommand('serverless login', process.cwd(), true);
        if (!loginResult.success) {
            logWithColor('⚠️  Serverless login failed, but continuing with deployment', 'yellow');
            logWithColor('  This may work if you are already authenticated', 'yellow');
        } else {
            logWithColor('✅ Serverless Framework authentication successful', 'green');
        }

        logWithColor('✅ Environment validation passed', 'green');
        return true;
    }

    /**
     * Deploy a single module to the specified stage
     */
    async deployModule(module) {
        const startTime = Date.now();
        logWithColor(`\n🚀 Deploying ${module.name} to ${this.stage}...`, 'cyan');

        try {
            // Check if module has environment-specific configuration
            if (module.hasEnvFile) {
                logWithColor(`  📋 Found .env file for ${module.name}`, 'blue');
            }

            // Execute serverless deploy command
            const deployCommand = `serverless deploy --stage ${this.stage}`;
            logWithColor(`  🔧 Running: ${deployCommand}`, 'blue');

            const result = executeCommand(deployCommand, module.path);
            const duration = Date.now() - startTime;

            if (result.success) {
                logWithColor(`  ✅ ${module.name} deployed successfully (${duration}ms)`, 'green');

                // Try to get endpoint information
                const endpoints = this.extractEndpoints(result.output);

                const deployResult = {
                    module: module.name,
                    success: true,
                    duration: duration,
                    endpoints: endpoints,
                    endpointCount: endpoints.length,
                    stage: this.stage,
                    deployedAt: new Date().toISOString(),
                    gitCommit: this.getCurrentGitCommit(),
                    fileHash: this.calculateModuleHash(module.path).hash,
                    deploymentOutput: result.output ? result.output.substring(0, 1000) : '', // First 1000 chars for debugging
                    hasApiGateway: endpoints.length > 0
                };

                this.deploymentResults.push(deployResult);
                return deployResult;

            } else {
                logWithColor(`  ❌ ${module.name} deployment failed`, 'red');
                
                // Enhanced error message for credential-related failures
                const errorMessage = result.error || 'Unknown deployment error';
                const enhancedError = this.enhanceErrorMessage(errorMessage);
                logWithColor(`  Error: ${enhancedError}`, 'red');

                const deployResult = {
                    module: module.name,
                    success: false,
                    duration: duration,
                    error: enhancedError,
                    stage: this.stage,
                    deploymentOutput: result.error ? result.error.substring(0, 1000) : '', // First 1000 chars for debugging
                    failureCategory: this.categorizeError(errorMessage)
                };

                this.deploymentResults.push(deployResult);
                return deployResult;
            }

        } catch (error) {
            const duration = Date.now() - startTime;
            logWithColor(`  ❌ ${module.name} deployment failed with exception`, 'red');
            
            // Enhanced error message for exceptions
            const enhancedError = this.enhanceErrorMessage(error.message);
            logWithColor(`  Error: ${enhancedError}`, 'red');

            const deployResult = {
                module: module.name,
                success: false,
                duration: duration,
                error: enhancedError,
                stage: this.stage,
                deploymentOutput: error.message ? error.message.substring(0, 1000) : '', // First 1000 chars for debugging
                failureCategory: this.categorizeError(error.message)
            };

            this.deploymentResults.push(deployResult);
            return deployResult;
        }
    }

    /**
     * Categorize errors for better reporting and troubleshooting
     */
    categorizeError(errorMessage) {
        if (!errorMessage) return 'unknown';
        
        const errorLower = errorMessage.toLowerCase();
        
        if (errorLower.includes('credential') || errorLower.includes('unauthorized') || 
            errorLower.includes('access denied') || errorLower.includes('invalid credentials')) {
            return 'credentials';
        }
        
        if (errorLower.includes('region') && (errorLower.includes('invalid') || errorLower.includes('not found'))) {
            return 'region';
        }
        
        if (errorLower.includes('serverless') || errorLower.includes('framework')) {
            return 'serverless';
        }
        
        if (errorLower.includes('permission') || errorLower.includes('forbidden') || errorLower.includes('not authorized')) {
            return 'permissions';
        }
        
        if (errorLower.includes('cloudformation') || errorLower.includes('stack')) {
            return 'cloudformation';
        }
        
        if (errorLower.includes('lambda')) {
            return 'lambda';
        }
        
        if (errorLower.includes('api gateway') || errorLower.includes('apigateway')) {
            return 'apigateway';
        }
        
        return 'unknown';
    }

    /**
     * Enhance error messages for better debugging, especially credential-related issues
     */
    enhanceErrorMessage(originalError) {
        const errorLower = originalError.toLowerCase();
        const isDevelopmentEnvironment = this.stage === 'dev' || this.stage === 'uat';
        const isProductionEnvironment = this.stage === 'prod';
        
        // AWS credential-related errors
        if (errorLower.includes('unable to locate credentials') || 
            errorLower.includes('credentialserror') ||
            errorLower.includes('no credentials') ||
            errorLower.includes('invalid credentials') ||
            errorLower.includes('the security token included in the request is invalid')) {
            
            let guidance = `${originalError}\n\n💡 Credential Issue Detected:\n`;
            
            if (isProductionEnvironment) {
                guidance += `   - Production deployment requires direct AWS credentials\n` +
                           `   - Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables\n` +
                           `   - AWS_PROFILE is not supported in production environments\n` +
                           `   - For CI/CD: Add credentials as GitHub secrets`;
            } else if (isDevelopmentEnvironment) {
                guidance += `   - Development environment supports multiple authentication methods:\n` +
                           `   - Recommended: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY\n` +
                           `   - Alternative: AWS_PROFILE with configured AWS CLI credentials\n` +
                           `   - Ensure both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set together`;
            }
            
            guidance += `\n   - Verify credentials have necessary permissions for Lambda, API Gateway, and CloudFormation\n` +
                       `   - Check if credentials are expired or invalid`;
            
            return guidance;
        }
        
        // AWS region-related errors
        if (errorLower.includes('region') && (errorLower.includes('invalid') || errorLower.includes('not found'))) {
            return `${originalError}\n\n💡 Region Issue Detected:\n` +
                   `   - Ensure AWS_REGION or AWS_DEFAULT_REGION is set\n` +
                   `   - Verify the region exists and you have access to it\n` +
                   `   - For CI/CD: Add AWS_REGION to GitHub secrets or workflow environment`;
        }
        
        // Serverless Framework authentication errors
        if (errorLower.includes('unauthorized') || errorLower.includes('serverless_access_key') ||
            errorLower.includes('serverless login') || errorLower.includes('authentication failed')) {
            return `${originalError}\n\n💡 Serverless Framework Authentication Issue:\n` +
                   `   - Ensure SERVERLESS_ACCESS_KEY is set correctly\n` +
                   `   - Get your access key from: https://app.serverless.com/\n` +
                   `   - Required for Serverless Framework v4 with AWS SDK v3\n` +
                   `   - For CI/CD: Add SERVERLESS_ACCESS_KEY to GitHub secrets`;
        }
        
        // AWS SDK version compatibility issues
        if (errorLower.includes('aws-sdk') || errorLower.includes('sdk')) {
            return `${originalError}\n\n💡 AWS SDK Issue Detected:\n` +
                   `   - Ensure you're using AWS SDK v3 compatible packages\n` +
                   `   - Check that Serverless Framework v4 is installed\n` +
                   `   - Verify Node.js 22 compatibility\n` +
                   `   - Update serverless plugins to latest versions`;
        }
        
        // Permission-related errors
        if (errorLower.includes('access denied') || errorLower.includes('forbidden') || 
            errorLower.includes('not authorized') || errorLower.includes('insufficient privileges')) {
            return `${originalError}\n\n💡 Permission Issue Detected:\n` +
                   `   - Verify AWS credentials have necessary permissions\n` +
                   `   - Required permissions: Lambda, API Gateway, CloudFormation, IAM\n` +
                   `   - Check if MFA or additional authentication is required\n` +
                   `   - Ensure IAM user/role has deployment permissions for target stage`;
        }
        
        // Missing or invalid environment variables
        if (errorLower.includes('environment variable') || errorLower.includes('env var')) {
            return `${originalError}\n\n💡 Environment Variable Issue:\n` +
                   `   - Check that all required environment variables are set\n` +
                   `   - Verify variable names are correct (case-sensitive)\n` +
                   `   - For CI/CD: Ensure secrets are properly configured in GitHub`;
        }
        
        return originalError;
    }

    /**
     * Extract API Gateway endpoints from serverless deploy output with enhanced patterns
     */
    extractEndpoints(output) {
        const endpoints = [];
        if (!output) return endpoints;

        const lines = output.split('\n');
        let inEndpointsSection = false;

        // Pattern 1: Extract from endpoints section
        for (const line of lines) {
            if (line.includes('endpoints:')) {
                inEndpointsSection = true;
                continue;
            }

            if (inEndpointsSection) {
                if (line.trim().startsWith('- ') || line.trim().startsWith('GET ') ||
                    line.trim().startsWith('POST ') || line.trim().startsWith('PUT ') ||
                    line.trim().startsWith('DELETE ') || line.trim().startsWith('PATCH ') ||
                    line.trim().startsWith('OPTIONS ') || line.trim().startsWith('HEAD ')) {
                    endpoints.push(line.trim());
                } else if (line.trim() === '' || line.includes('functions:') || line.includes('layers:')) {
                    break;
                }
            }
        }

        // Pattern 2: Extract direct HTTPS URLs
        const urlPattern = /https:\/\/[a-zA-Z0-9.-]+\.execute-api\.[a-zA-Z0-9.-]+\.amazonaws\.com[^\s]*/g;
        const urlMatches = output.match(urlPattern);
        if (urlMatches) {
            urlMatches.forEach(url => {
                if (!endpoints.some(endpoint => endpoint.includes(url))) {
                    endpoints.push(url);
                }
            });
        }

        // Pattern 3: Extract from service information section
        const serviceInfoPattern = /Service Information[\s\S]*?(?=\n\n|\nStack Outputs|\nfunctions:|\n$)/;
        const serviceInfoMatch = output.match(serviceInfoPattern);
        if (serviceInfoMatch) {
            const serviceInfo = serviceInfoMatch[0];
            const serviceUrlPattern = /https:\/\/[^\s]+/g;
            const serviceUrls = serviceInfo.match(serviceUrlPattern);
            if (serviceUrls) {
                serviceUrls.forEach(url => {
                    if (!endpoints.some(endpoint => endpoint.includes(url))) {
                        endpoints.push(url);
                    }
                });
            }
        }

        return endpoints.filter(endpoint => endpoint.length > 0);
    }

    /**
     * Deploy modules in batches with controlled concurrency and change detection
     */
    async deployAllModules(concurrency = 2, forceAll = false) {
        logWithColor(`\n🎯 Starting deployment to ${this.stage} environment`, 'magenta');

        // Discover all modules
        const modules = discoverModules();

        if (modules.length === 0) {
            logWithColor('\n❌ No Lambda modules found to deploy', 'red');
            return false;
        }

        // Load previous deployment state
        const previousState = this.loadDeploymentState();

        logWithColor(`\n🔍 Checking for changes in ${modules.length} modules...`, 'cyan');

        // Filter modules that need deployment
        const modulesToDeploy = [];
        const skippedModules = [];

        for (const module of modules) {
            if (forceAll) {
                modulesToDeploy.push(module);
                logWithColor(`  📦 ${module.name}: Force deployment requested`, 'blue');
            } else {
                const changeCheck = this.needsDeployment(module, previousState);
                if (changeCheck.needsDeployment) {
                    modulesToDeploy.push(module);
                } else {
                    skippedModules.push({ module, reason: changeCheck.reason });
                }
            }
        }

        if (modulesToDeploy.length === 0) {
            logWithColor('\n✅ No modules need deployment - all are up to date!', 'green');
            if (skippedModules.length > 0) {
                logWithColor('\n📋 Skipped modules:', 'cyan');
                skippedModules.forEach(({ module, reason }) => {
                    logWithColor(`  📦 ${module.name}: ${reason}`, 'green');
                });
            }
            return true;
        }

        logWithColor(`\n📦 Deploying ${modulesToDeploy.length} modules with concurrency: ${concurrency}`, 'cyan');

        if (skippedModules.length > 0) {
            logWithColor(`\n⏭️  Skipping ${skippedModules.length} unchanged modules:`, 'yellow');
            skippedModules.forEach(({ module, reason }) => {
                logWithColor(`  📦 ${module.name}: ${reason}`, 'yellow');
            });
        }

        // Deploy modules in batches to control concurrency and respect AWS API limits
        for (let i = 0; i < modulesToDeploy.length; i += concurrency) {
            const batch = modulesToDeploy.slice(i, i + concurrency);
            const batchNumber = Math.floor(i / concurrency) + 1;
            const totalBatches = Math.ceil(modulesToDeploy.length / concurrency);

            logWithColor(`\n🔄 Batch ${batchNumber}/${totalBatches}: Deploying ${batch.map(m => m.name).join(', ')}`, 'yellow');

            // Deploy all modules in the current batch concurrently
            const batchPromises = batch.map((module, index) => {
                const moduleIndex = i + index + 1;
                logWithColor(`  [${moduleIndex}/${modulesToDeploy.length}] Starting ${module.name}...`, 'blue');
                return this.deployModule(module);
            });

            // Wait for all deployments in the batch to complete
            await Promise.all(batchPromises);

            // Add a delay between batches to be respectful of AWS API limits
            if (i + concurrency < modulesToDeploy.length) {
                logWithColor(`  ⏳ Batch complete. Waiting 3 seconds before next batch...`, 'blue');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }

        // Save deployment state for successful deployments
        this.saveDeploymentState(this.buildNewState(previousState));

        return true;
    }

    /**
     * Build new deployment state from current results
     */
    buildNewState(previousState) {
        const newState = { ...previousState };

        for (const result of this.deploymentResults) {
            if (result.success) {
                newState[result.module] = {
                    deployedAt: result.deployedAt,
                    gitCommit: result.gitCommit,
                    fileHash: result.fileHash,
                    stage: result.stage
                };
            }
        }

        return newState;
    }

    /**
     * Generate and display deployment summary
     */
    displayDeploymentSummary() {
        const totalDuration = Date.now() - this.startTime;
        const successful = this.deploymentResults.filter(r => r.success);
        const failed = this.deploymentResults.filter(r => !r.success);

        logWithColor('\n' + '='.repeat(60), 'cyan');
        logWithColor('📊 DEPLOYMENT SUMMARY', 'cyan');
        logWithColor('='.repeat(60), 'cyan');

        logWithColor(`🎯 Stage: ${this.stage}`, 'blue');
        logWithColor(`⏱️  Total Duration: ${totalDuration}ms`, 'blue');
        logWithColor(`✅ Successful: ${successful.length}`, 'green');
        logWithColor(`❌ Failed: ${failed.length}`, failed.length > 0 ? 'red' : 'green');

        if (successful.length > 0) {
            logWithColor('\n✅ SUCCESSFUL DEPLOYMENTS:', 'green');
            let totalEndpoints = 0;
            successful.forEach(result => {
                logWithColor(`  📦 ${result.module} (${result.duration}ms)`, 'green');
                if (result.endpoints && result.endpoints.length > 0) {
                    totalEndpoints += result.endpoints.length;
                    logWithColor(`    🔗 API Endpoints (${result.endpoints.length}):`, 'cyan');
                    result.endpoints.forEach(endpoint => {
                        logWithColor(`      ${endpoint}`, 'cyan');
                    });
                } else {
                    logWithColor(`    ℹ️  No HTTP endpoints (Lambda functions only)`, 'blue');
                }
                if (result.gitCommit) {
                    logWithColor(`    📝 Git commit: ${result.gitCommit.substring(0, 8)}`, 'blue');
                }
            });
            
            if (totalEndpoints > 0) {
                logWithColor(`\n📊 Total API endpoints deployed: ${totalEndpoints}`, 'green');
            }
        }

        if (failed.length > 0) {
            logWithColor('\n❌ FAILED DEPLOYMENTS:', 'red');
            const errorCategories = {};
            
            failed.forEach(result => {
                logWithColor(`  📦 ${result.module}: ${result.error}`, 'red');
                if (result.failureCategory) {
                    logWithColor(`    🔍 Category: ${result.failureCategory}`, 'yellow');
                    errorCategories[result.failureCategory] = (errorCategories[result.failureCategory] || 0) + 1;
                }
            });
            
            if (Object.keys(errorCategories).length > 0) {
                logWithColor('\n📊 Error Summary:', 'yellow');
                Object.entries(errorCategories).forEach(([category, count]) => {
                    logWithColor(`  ${category}: ${count} failure(s)`, 'yellow');
                });
            }
        }

        logWithColor('\n' + '='.repeat(60), 'cyan');

        return failed.length === 0;
    }
}

/**
 * Display help information
 */
function displayHelp() {
    logWithColor('🚀 Lambda Deployment Automation', 'magenta');
    logWithColor('\nUsage: node scripts/deploy.js [stage] [options]', 'cyan');
    logWithColor('\nStages:', 'yellow');
    logWithColor('  dev  - Deploy to development environment (default)', 'blue');
    logWithColor('  prod - Deploy to production environment', 'blue');
    logWithColor('  uat  - Deploy to UAT environment', 'blue');
    logWithColor('\nOptions:', 'yellow');
    logWithColor('  --concurrency=N  Number of concurrent deployments (1-3, default: 2)', 'blue');
    logWithColor('  --force          Deploy all modules regardless of changes', 'blue');
    logWithColor('  --help, -h       Show this help message', 'blue');
    logWithColor('\nChange Detection:', 'yellow');
    logWithColor('  dev:  Uses file hash comparison for change detection', 'blue');
    logWithColor('  prod: Uses Git commit comparison for change detection', 'blue');
    logWithColor('\nBranch-based Deployment (GitHub Actions):', 'yellow');
    logWithColor('  development branch → dev environment', 'blue');
    logWithColor('  main branch → prod environment', 'blue');
    logWithColor('\nExamples:', 'yellow');
    logWithColor('  Basic usage:', 'cyan');
    logWithColor('    node scripts/deploy.js                       # Deploy changed modules to dev', 'blue');
    logWithColor('    node scripts/deploy.js dev                   # Deploy changed modules to dev', 'blue');
    logWithColor('    node scripts/deploy.js prod --concurrency=1  # Deploy changed modules to prod sequentially', 'blue');
    logWithColor('    node scripts/deploy.js dev --force           # Force deploy all modules to dev', 'blue');
    logWithColor('  Local development:', 'cyan');
    logWithColor('    AWS_PROFILE=myapp node scripts/deploy.js dev --concurrency=2', 'blue');
    logWithColor('  Production deployment:', 'cyan');
    logWithColor('    AWS_ACCESS_KEY_ID=xxx AWS_SECRET_ACCESS_KEY=xxx node scripts/deploy.js prod', 'blue');
    logWithColor('  CI/CD (with secrets):', 'cyan');
    logWithColor('    node scripts/deploy.js prod --concurrency=2  # Uses AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY', 'blue');
    logWithColor('\nPrerequisites:', 'yellow');
    logWithColor('  - Serverless Framework v4 installed globally', 'blue');
    logWithColor('  - AWS credentials configured (profile or environment variables)', 'blue');
    logWithColor('  - SERVERLESS_ACCESS_KEY environment variable set', 'blue');
    logWithColor('  - For local: AWS_PROFILE=myapp', 'blue');
}

/**
 * Main deployment function
 */
async function main() {
    // Check for help flag
    const args = process.argv.slice(2);
    if (args.includes('--help') || args.includes('-h')) {
        displayHelp();
        process.exit(0);
    }

    // Parse arguments
    let stage = 'dev';
    let concurrency = 2;
    let forceAll = false;

    for (const arg of args) {
        if (arg.startsWith('--concurrency=')) {
            const value = parseInt(arg.split('=')[1]);
            if (value >= 1 && value <= 3) {
                concurrency = value;
            } else {
                logWithColor('❌ Concurrency must be between 1 and 3', 'red');
                process.exit(2);
            }
        } else if (arg === '--force') {
            forceAll = true;
        } else if (!arg.startsWith('--')) {
            stage = arg;
        }
    }

    logWithColor('🚀 Lambda Deployment Automation', 'magenta');
    logWithColor(`📅 Started at: ${new Date().toISOString()}`, 'blue');
    logWithColor(`🎯 Stage: ${stage}, Concurrency: ${concurrency}${forceAll ? ', Force: enabled' : ''}`, 'blue');

    const deploymentManager = new DeploymentManager(stage);

    try {
        // Validate environment
        if (!deploymentManager.validateDeploymentEnvironment()) {
            process.exit(2);
        }

        // Deploy all modules
        const deploymentStarted = await deploymentManager.deployAllModules(concurrency, forceAll);

        if (!deploymentStarted) {
            process.exit(2);
        }

        // Display summary
        const allSuccessful = deploymentManager.displayDeploymentSummary();

        if (allSuccessful) {
            logWithColor('\n🎉 All deployments completed successfully!', 'green');
            process.exit(0);
        } else {
            logWithColor('\n⚠️  Some deployments failed. Check the summary above.', 'yellow');
            process.exit(1);
        }

    } catch (error) {
        logWithColor(`\n💥 Deployment process failed: ${error.message}`, 'red');
        console.error(error);
        process.exit(2);
    }
}

// Run the deployment if this script is executed directly
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
    main().catch(error => {
        logWithColor(`\n💥 Unhandled error: ${error.message}`, 'red');
        console.error(error);
        process.exit(2);
    });
}

export { DeploymentManager };