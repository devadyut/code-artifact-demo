#!/usr/bin/env node

import { discoverModules, executeCommand, logWithColor, validateEnvironment } from './utils.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

        // For dev/uat, use file hash-based change detection
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

        // Check AWS credentials based on deployment stage
        const hasProfile = process.env.AWS_PROFILE;
        const hasDirectCredentials = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;

        if (this.stage === 'prod') {
            // Production requires direct AWS credentials (no profile)
            if (!hasDirectCredentials) {
                logWithColor('\n❌ Production deployment requires direct AWS credentials', 'red');
                logWithColor('Please ensure AWS credentials are set via:', 'yellow');
                logWithColor('  CI/CD (GitHub Actions):', 'cyan');
                logWithColor('    - AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY secrets', 'blue');
                logWithColor('  Local production deployment:', 'cyan');
                logWithColor('    - export AWS_ACCESS_KEY_ID=your_access_key', 'blue');
                logWithColor('    - export AWS_SECRET_ACCESS_KEY=your_secret_key', 'blue');
                logWithColor('\n⚠️  AWS_PROFILE is not supported for production deployments', 'yellow');
                return false;
            }
            logWithColor('✅ Using direct AWS credentials for production', 'green');
        } else {
            // Development/UAT allows both profile and direct credentials
            if (!hasProfile && !hasDirectCredentials) {
                logWithColor('\n❌ AWS credentials not configured properly', 'red');
                logWithColor('Please ensure AWS credentials are set via:', 'yellow');
                logWithColor('  Local development (recommended):', 'cyan');
                logWithColor('    - AWS_PROFILE=taleofddh', 'blue');
                logWithColor('    - AWS CLI configuration (~/.aws/credentials)', 'blue');
                logWithColor('  Alternative:', 'cyan');
                logWithColor('    - AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY', 'blue');
                return false;
            }

            if (hasProfile) {
                logWithColor(`✅ Using AWS Profile: ${process.env.AWS_PROFILE}`, 'green');
            } else {
                logWithColor('✅ Using direct AWS credentials', 'green');
            }
        }

        // Check Serverless Framework authentication for v4
        const hasServerlessAccessKey = process.env.SERVERLESS_ACCESS_KEY;
        if (!hasServerlessAccessKey) {
            logWithColor('\n❌ Serverless Framework v4 authentication not configured', 'red');
            logWithColor('Please ensure SERVERLESS_ACCESS_KEY is set:', 'yellow');
            logWithColor('  Local development:', 'cyan');
            logWithColor('    - SERVERLESS_ACCESS_KEY=your_access_key', 'blue');
            logWithColor('    - Get your access key from: https://app.serverless.com/', 'blue');
            logWithColor('  CI/CD (GitHub Actions):', 'cyan');
            logWithColor('    - Add SERVERLESS_ACCESS_KEY to GitHub Secrets', 'blue');
            return false;
        } else {
            logWithColor('✅ Serverless Framework access key configured', 'green');
        }

        // Validate stage parameter
        const validStages = ['dev', 'prod', 'uat'];
        if (!validStages.includes(this.stage)) {
            logWithColor(`\n❌ Invalid stage: ${this.stage}`, 'red');
            logWithColor(`Valid stages are: ${validStages.join(', ')}`, 'yellow');
            return false;
        }

        // Check if serverless CLI is available
        const serverlessCheck = executeCommand('serverless --version', process.cwd(), true);
        if (!serverlessCheck.success) {
            logWithColor('\n❌ Serverless Framework not found', 'red');
            logWithColor('Please install serverless globally: npm install -g serverless', 'yellow');
            return false;
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
                    stage: this.stage,
                    deployedAt: new Date().toISOString(),
                    gitCommit: this.getCurrentGitCommit(),
                    fileHash: this.calculateModuleHash(module.path).hash
                };

                this.deploymentResults.push(deployResult);
                return deployResult;

            } else {
                logWithColor(`  ❌ ${module.name} deployment failed`, 'red');
                logWithColor(`  Error: ${result.error}`, 'red');

                const deployResult = {
                    module: module.name,
                    success: false,
                    duration: duration,
                    error: result.error,
                    stage: this.stage
                };

                this.deploymentResults.push(deployResult);
                return deployResult;
            }

        } catch (error) {
            const duration = Date.now() - startTime;
            logWithColor(`  ❌ ${module.name} deployment failed with exception`, 'red');
            logWithColor(`  Error: ${error.message}`, 'red');

            const deployResult = {
                module: module.name,
                success: false,
                duration: duration,
                error: error.message,
                stage: this.stage
            };

            this.deploymentResults.push(deployResult);
            return deployResult;
        }
    }

    /**
     * Extract API Gateway endpoints from serverless deploy output
     */
    extractEndpoints(output) {
        const endpoints = [];
        if (!output) return endpoints;

        const lines = output.split('\n');
        let inEndpointsSection = false;

        for (const line of lines) {
            if (line.includes('endpoints:')) {
                inEndpointsSection = true;
                continue;
            }

            if (inEndpointsSection) {
                if (line.trim().startsWith('- ') || line.trim().startsWith('GET ') ||
                    line.trim().startsWith('POST ') || line.trim().startsWith('PUT ') ||
                    line.trim().startsWith('DELETE ')) {
                    endpoints.push(line.trim());
                } else if (line.trim() === '' || line.includes('functions:')) {
                    break;
                }
            }
        }

        return endpoints;
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
            successful.forEach(result => {
                logWithColor(`  📦 ${result.module} (${result.duration}ms)`, 'green');
                if (result.endpoints && result.endpoints.length > 0) {
                    result.endpoints.forEach(endpoint => {
                        logWithColor(`    🔗 ${endpoint}`, 'cyan');
                    });
                }
            });
        }

        if (failed.length > 0) {
            logWithColor('\n❌ FAILED DEPLOYMENTS:', 'red');
            failed.forEach(result => {
                logWithColor(`  📦 ${result.module}: ${result.error}`, 'red');
            });
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
    logWithColor('  dev/uat: Uses file hash comparison for change detection', 'blue');
    logWithColor('  prod:    Uses Git commit comparison for change detection', 'blue');
    logWithColor('\nExamples:', 'yellow');
    logWithColor('  Basic usage:', 'cyan');
    logWithColor('    node scripts/deploy.js                       # Deploy changed modules to dev', 'blue');
    logWithColor('    node scripts/deploy.js dev                   # Deploy changed modules to dev', 'blue');
    logWithColor('    node scripts/deploy.js prod --concurrency=1  # Deploy changed modules to prod sequentially', 'blue');
    logWithColor('    node scripts/deploy.js uat --concurrency=3   # Deploy changed modules to uat with max concurrency', 'blue');
    logWithColor('    node scripts/deploy.js dev --force           # Force deploy all modules to dev', 'blue');
    logWithColor('  Local development:', 'cyan');
    logWithColor('    AWS_PROFILE=taleofddh node scripts/deploy.js dev --concurrency=2', 'blue');
    logWithColor('  Production deployment:', 'cyan');
    logWithColor('    AWS_ACCESS_KEY_ID=xxx AWS_SECRET_ACCESS_KEY=xxx node scripts/deploy.js prod', 'blue');
    logWithColor('  CI/CD (with secrets):', 'cyan');
    logWithColor('    node scripts/deploy.js prod --concurrency=2  # Uses AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY', 'blue');
    logWithColor('\nPrerequisites:', 'yellow');
    logWithColor('  - Serverless Framework v4 installed globally', 'blue');
    logWithColor('  - AWS credentials configured (profile or environment variables)', 'blue');
    logWithColor('  - SERVERLESS_ACCESS_KEY environment variable set', 'blue');
    logWithColor('  - For local: AWS_PROFILE=taleofddh', 'blue');
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