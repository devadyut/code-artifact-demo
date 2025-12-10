#!/usr/bin/env node

/**
 * AWS CodeBuild Project Setup Script
 * 
 * This script creates and configures an AWS CodeBuild project with GitHub webhook integration
 * for automated package publishing to CodeArtifact.
 * 
 * Features:
 * - Creates CodeBuild project with GitHub source integration
 * - Configures webhook filters for main branch and my-lib/** path changes
 * - Sets up GitHub personal access token authentication
 * - Configures automatic status reporting to GitHub commits
 * - Creates required IAM service role with appropriate permissions
 * - Tests webhook functionality
 * 
 * Requirements:
 * - AWS CLI configured with appropriate permissions
 * - GitHub personal access token with repo and repo:status scopes
 * - CodeArtifact domain and repository already created
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  CodeBuildClient,
  CreateProjectCommand,
  UpdateProjectCommand,
  BatchGetProjectsCommand,
  DeleteWebhookCommand,
  CreateWebhookCommand,
  BatchGetBuildsCommand,
  StartBuildCommand
} from '@aws-sdk/client-codebuild';
import {
  IAMClient,
  CreateRoleCommand,
  AttachRolePolicyCommand,
  GetRoleCommand,
  CreatePolicyCommand,
  GetPolicyCommand
} from '@aws-sdk/client-iam';
import {
  STSClient,
  GetCallerIdentityCommand
} from '@aws-sdk/client-sts';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration constants
const PROJECT_NAME = 'publish-packages-to-codeartifact';
const SERVICE_ROLE_NAME = 'CodeBuildServiceRole-PackagePublishing';
const POLICY_NAME = 'CodeBuildPackagePublishingPolicy';

/**
 * Load configuration from codeartifact-config.json
 */
async function loadConfiguration() {
  try {
    const configPath = path.join(__dirname, '..', 'codeartifact-config.json');
    const configContent = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configContent);
    
    // Validate required configuration
    const required = [
      'aws.region',
      'aws.accountId',
      'codeartifact.domain',
      'codeartifact.repository',
      'github.repository'
    ];
    
    for (const key of required) {
      const value = key.split('.').reduce((obj, k) => obj?.[k], config);
      if (!value) {
        throw new Error(`Missing required configuration: ${key}`);
      }
    }
    
    // Replace environment variables
    if (config.aws.accountId.startsWith('${') && config.aws.accountId.endsWith('}')) {
      const envVar = config.aws.accountId.slice(2, -1);
      config.aws.accountId = process.env[envVar];
      if (!config.aws.accountId) {
        config.aws.accountId = null; // Will be set later from AWS credentials
      }
    }
    
    return config;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('Configuration file codeartifact-config.json not found. Please ensure it exists in the project root.');
    }
    logger.error('Failed to load configuration:', error.message);
    throw error;
  }
}

/**
 * Get GitHub token from environment or prompt user
 */
function getGitHubToken() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    logger.error('GitHub token not found. Please set GITHUB_TOKEN environment variable.');
    logger.info('The token needs the following scopes:');
    logger.info('  - repo (for private repositories) or public_repo (for public repositories)');
    logger.info('  - repo:status (to update commit status)');
    logger.info('');
    logger.info('Create a token at: https://github.com/settings/tokens');
    logger.info('Then run: export GITHUB_TOKEN=your_token_here');
    throw new Error('GitHub token required');
  }
  return token;
}

/**
 * Create AWS clients
 */
function createAWSClients(region, profile) {
  const clientConfig = { region };
  if (profile && profile !== 'default') {
    // Note: AWS SDK v3 uses shared credentials file automatically
    logger.info(`Using AWS profile: ${profile}`);
  }
  
  return {
    codebuild: new CodeBuildClient(clientConfig),
    iam: new IAMClient(clientConfig),
    sts: new STSClient(clientConfig)
  };
}

/**
 * Verify AWS credentials and permissions
 */
async function verifyAWSCredentials(stsClient) {
  try {
    const command = new GetCallerIdentityCommand({});
    const response = await stsClient.send(command);
    
    logger.success('AWS credentials verified');
    logger.info(`Account ID: ${response.Account}`);
    logger.info(`User/Role: ${response.Arn}`);
    
    return response.Account;
  } catch (error) {
    logger.error('AWS credential verification failed:', error.message);
    logger.info('Please ensure AWS CLI is configured with valid credentials');
    logger.info('Run: aws configure');
    throw error;
  }
}

/**
 * Create IAM service role for CodeBuild
 */
async function createServiceRole(iamClient, accountId, region, codeartifactDomain) {
  try {
    // Check if role already exists
    try {
      const getRoleCommand = new GetRoleCommand({ RoleName: SERVICE_ROLE_NAME });
      const existingRole = await iamClient.send(getRoleCommand);
      logger.info(`Service role ${SERVICE_ROLE_NAME} already exists`);
      return existingRole.Role.Arn;
    } catch (error) {
      if (error.name !== 'NoSuchEntityException') {
        throw error;
      }
    }
    
    logger.info(`Creating IAM service role: ${SERVICE_ROLE_NAME}`);
    
    // Trust policy for CodeBuild
    const trustPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: {
            Service: 'codebuild.amazonaws.com'
          },
          Action: 'sts:AssumeRole'
        }
      ]
    };
    
    // Create the role
    const createRoleCommand = new CreateRoleCommand({
      RoleName: SERVICE_ROLE_NAME,
      AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
      Description: 'Service role for CodeBuild package publishing project'
    });
    
    const roleResponse = await iamClient.send(createRoleCommand);
    logger.success(`Created service role: ${SERVICE_ROLE_NAME}`);
    
    // Create custom policy for CodeArtifact and CloudWatch Logs
    const policyDocument = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: [
            'codeartifact:GetAuthorizationToken',
            'codeartifact:GetRepositoryEndpoint',
            'codeartifact:PublishPackageVersion',
            'codeartifact:PutPackageMetadata',
            'codeartifact:ReadFromRepository'
          ],
          Resource: [
            `arn:aws:codeartifact:${region}:${accountId}:domain/${codeartifactDomain}`,
            `arn:aws:codeartifact:${region}:${accountId}:domain/${codeartifactDomain}/*`,
            `arn:aws:codeartifact:${region}:${accountId}:repository/${codeartifactDomain}/*`
          ]
        },
        {
          Effect: 'Allow',
          Action: 'sts:GetServiceBearerToken',
          Resource: '*',
          Condition: {
            StringEquals: {
              'sts:AWSServiceName': 'codeartifact.amazonaws.com'
            }
          }
        },
        {
          Effect: 'Allow',
          Action: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents'
          ],
          Resource: [
            `arn:aws:logs:${region}:${accountId}:log-group:/aws/codebuild/${PROJECT_NAME}`,
            `arn:aws:logs:${region}:${accountId}:log-group:/aws/codebuild/${PROJECT_NAME}:*`
          ]
        }
      ]
    };
    
    // Check if policy already exists
    let policyArn;
    try {
      const getPolicyCommand = new GetPolicyCommand({
        PolicyArn: `arn:aws:iam::${accountId}:policy/${POLICY_NAME}`
      });
      const existingPolicy = await iamClient.send(getPolicyCommand);
      policyArn = existingPolicy.Policy.Arn;
      logger.info(`Policy ${POLICY_NAME} already exists`);
    } catch (error) {
      if (error.name === 'NoSuchEntityException') {
        // Create the policy
        const createPolicyCommand = new CreatePolicyCommand({
          PolicyName: POLICY_NAME,
          PolicyDocument: JSON.stringify(policyDocument),
          Description: 'Policy for CodeBuild package publishing to CodeArtifact'
        });
        
        const policyResponse = await iamClient.send(createPolicyCommand);
        policyArn = policyResponse.Policy.Arn;
        logger.success(`Created policy: ${POLICY_NAME}`);
      } else {
        throw error;
      }
    }
    
    // Attach the policy to the role
    const attachPolicyCommand = new AttachRolePolicyCommand({
      RoleName: SERVICE_ROLE_NAME,
      PolicyArn: policyArn
    });
    
    await iamClient.send(attachPolicyCommand);
    logger.success('Attached policy to service role');
    
    // Wait a moment for IAM consistency
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return roleResponse.Role.Arn;
    
  } catch (error) {
    logger.error('Failed to create service role:', error.message);
    throw error;
  }
}

/**
 * Check if CodeBuild project exists
 */
async function projectExists(codebuildClient, projectName) {
  try {
    const command = new BatchGetProjectsCommand({ names: [projectName] });
    const response = await codebuildClient.send(command);
    return response.projects && response.projects.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Create or update CodeBuild project
 */
async function createCodeBuildProject(codebuildClient, config, serviceRoleArn, githubToken) {
  const { aws, github, codeartifact } = config;
  
  const projectConfig = {
    name: PROJECT_NAME,
    description: 'Automated package publishing to AWS CodeArtifact',
    source: {
      type: 'GITHUB',
      location: `https://github.com/${github.repository}.git`,
      gitCloneDepth: 1,
      buildspec: 'buildspec.yml',
      auth: {
        type: 'OAUTH',
        resource: githubToken
      },
      reportBuildStatus: true
    },
    artifacts: {
      type: 'NO_ARTIFACTS'
    },
    environment: {
      type: 'LINUX_CONTAINER',
      image: 'aws/codebuild/standard:7.0',
      computeType: 'BUILD_GENERAL1_SMALL',
      environmentVariables: [
        {
          name: 'AWS_REGION',
          value: aws.region
        },
        {
          name: 'AWS_ACCOUNT_ID',
          value: aws.accountId
        },
        {
          name: 'CODEARTIFACT_DOMAIN',
          value: codeartifact.domain
        },
        {
          name: 'CODEARTIFACT_REPOSITORY',
          value: codeartifact.repository
        },
        {
          name: 'PACKAGE_SCOPE',
          value: codeartifact.scope
        },
        {
          name: 'GITHUB_REPOSITORY',
          value: github.repository
        }
      ]
    },
    serviceRole: serviceRoleArn,
    timeoutInMinutes: 30,
    badgeEnabled: true,
    logsConfig: {
      cloudWatchLogs: {
        status: 'ENABLED',
        groupName: `/aws/codebuild/${PROJECT_NAME}`
      }
    }
  };
  
  try {
    const exists = await projectExists(codebuildClient, PROJECT_NAME);
    
    if (exists) {
      logger.info(`Updating existing CodeBuild project: ${PROJECT_NAME}`);
      const updateCommand = new UpdateProjectCommand(projectConfig);
      await codebuildClient.send(updateCommand);
      logger.success('CodeBuild project updated successfully');
    } else {
      logger.info(`Creating CodeBuild project: ${PROJECT_NAME}`);
      const createCommand = new CreateProjectCommand(projectConfig);
      await codebuildClient.send(createCommand);
      logger.success('CodeBuild project created successfully');
    }
    
    return PROJECT_NAME;
    
  } catch (error) {
    logger.error('Failed to create/update CodeBuild project');
    logger.error('Error name:', error.name);
    logger.error('Error message:', error.message);
    
    // Log AWS-specific error details if available
    if (error.$metadata) {
      logger.error('AWS Error Details:');
      logger.error('  Status Code:', error.$metadata.httpStatusCode);
      logger.error('  Request ID:', error.$metadata.requestId);
      logger.error('  Service:', error.$metadata.service);
    }
    
    // Log additional error properties that might be helpful
    if (error.Code) {
      logger.error('AWS Error Code:', error.Code);
    }
    
    if (error.$fault) {
      logger.error('Fault type:', error.$fault);
    }
    
    // Log the full error object in debug mode
    if (process.env.DEBUG) {
      logger.debug('Full error object:', JSON.stringify(error, null, 2));
    }
    
    // Provide specific guidance for common errors
    if (error.name === 'InvalidInputException') {
      logger.info('💡 This usually indicates an issue with the project configuration.');
      logger.info('   Check the GitHub repository URL, service role ARN, and environment variables.');
    } else if (error.name === 'ResourceAlreadyExistsException') {
      logger.info('💡 A project with this name already exists.');
      logger.info('   The script will attempt to update it instead.');
    } else if (error.name === 'AccessDeniedException') {
      logger.info('💡 Insufficient permissions to create/update CodeBuild project.');
      logger.info('   Ensure your AWS credentials have CodeBuild permissions.');
    } else if (error.message?.includes('GitHub')) {
      logger.info('💡 This appears to be a GitHub authentication issue.');
      logger.info('   Verify your GITHUB_TOKEN has the required scopes:');
      logger.info('     - repo (for private repos) or public_repo (for public repos)');
      logger.info('     - repo:status (to update commit status)');
    }
    
    throw error;
  }
}

/**
 * Configure GitHub webhook
 */
async function configureWebhook(codebuildClient, projectName) {
  try {
    logger.info('Configuring GitHub webhook...');
    
    // Delete existing webhook if it exists
    try {
      const deleteCommand = new DeleteWebhookCommand({ projectName });
      await codebuildClient.send(deleteCommand);
      logger.info('Deleted existing webhook');
    } catch (error) {
      // Webhook might not exist, which is fine
      if (!error.message.includes('does not exist')) {
        logger.warn('Warning while deleting webhook:', error.message);
      }
    }
    
    // Create new webhook with filters
    const webhookConfig = {
      projectName,
      branchFilter: '^refs/heads/main$',
      filterGroups: [
        [
          {
            type: 'EVENT',
            pattern: 'PUSH'
          },
          {
            type: 'HEAD_REF',
            pattern: '^refs/heads/main$'
          },
          {
            type: 'FILE_PATH',
            pattern: '^my-lib/.*'
          }
        ]
      ]
    };
    
    const createWebhookCommand = new CreateWebhookCommand(webhookConfig);
    const response = await codebuildClient.send(createWebhookCommand);
    
    logger.success('GitHub webhook configured successfully');
    logger.info(`Webhook URL: ${response.webhook.url}`);
    logger.info('Webhook filters:');
    logger.info('  - Event: PUSH');
    logger.info('  - Branch: main');
    logger.info('  - Path: my-lib/**');
    
    return response.webhook;
    
  } catch (error) {
    logger.error('Failed to configure webhook:', error.message);
    
    if (error.message.includes('Personal Access Token')) {
      logger.error('GitHub Personal Access Token issue detected');
      logger.info('Please ensure your token has the following scopes:');
      logger.info('  - repo (for private repositories) or public_repo (for public repositories)');
      logger.info('  - repo:status (to update commit status)');
      logger.info('  - admin:repo_hook (to create webhooks)');
    }
    
    throw error;
  }
}

/**
 * Test webhook functionality with a sample build
 */
async function testWebhookFunctionality(codebuildClient, projectName, config) {
  try {
    logger.info('Testing CodeBuild project functionality...');
    
    // Start a test build
    const startBuildCommand = new StartBuildCommand({
      projectName,
      environmentVariablesOverride: [
        {
          name: 'TEST_BUILD',
          value: 'true'
        },
        {
          name: 'GITHUB_SHA',
          value: 'test-commit-sha'
        },
        {
          name: 'GITHUB_REF',
          value: 'refs/heads/main'
        }
      ]
    });
    
    const buildResponse = await codebuildClient.send(startBuildCommand);
    const buildId = buildResponse.build.id;
    
    logger.info(`Test build started: ${buildId}`);
    logger.info('Waiting for build to start...');
    
    // Wait a moment for the build to initialize
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check build status
    const getBuildCommand = new BatchGetBuildsCommand({ ids: [buildId] });
    const buildStatusResponse = await codebuildClient.send(getBuildCommand);
    const build = buildStatusResponse.builds[0];
    
    logger.info(`Build status: ${build.buildStatus}`);
    logger.info(`Build phase: ${build.currentPhase || 'SUBMITTED'}`);
    
    if (build.buildStatus === 'IN_PROGRESS' || build.buildStatus === 'SUCCEEDED') {
      logger.success('Test build started successfully');
      logger.info(`Monitor build progress at: https://console.aws.amazon.com/codesuite/codebuild/projects/${projectName}/build/${buildId}`);
    } else if (build.buildStatus === 'FAILED') {
      logger.warn('Test build failed - this may be expected if buildspec.yml is not properly configured');
      logger.info('Check the build logs for details');
    }
    
    return buildId;
    
  } catch (error) {
    logger.error('Failed to test webhook functionality:', error.message);
    logger.info('This may be due to missing buildspec.yml or other configuration issues');
    logger.info('The webhook should still work once the repository is properly configured');
    return null;
  }
}

/**
 * Display setup summary and next steps
 */
function displaySummary(config, projectName, webhookUrl, buildId) {
  logger.info('');
  logger.success('🎉 CodeBuild setup completed successfully!');
  logger.info('');
  logger.info('📋 Setup Summary:');
  logger.info(`  ✅ CodeBuild Project: ${projectName}`);
  logger.info(`  ✅ GitHub Repository: ${config.github.repository}`);
  logger.info(`  ✅ Webhook URL: ${webhookUrl}`);
  logger.info(`  ✅ Service Role: ${SERVICE_ROLE_NAME}`);
  logger.info(`  ✅ IAM Policy: ${POLICY_NAME}`);
  
  if (buildId) {
    logger.info(`  ✅ Test Build: ${buildId}`);
  }
  
  logger.info('');
  logger.info('🔧 Webhook Configuration:');
  logger.info('  • Triggers on: Push to main branch');
  logger.info('  • Path filter: my-lib/**');
  logger.info('  • Status reporting: Enabled');
  logger.info('');
  logger.info('📚 Next Steps:');
  logger.info('  1. Ensure buildspec.yml exists in your repository root');
  logger.info('  2. Push changes to my-lib/** on main branch to test webhook');
  logger.info('  3. Monitor builds in AWS CodeBuild console');
  logger.info('  4. Check GitHub commit status for build results');
  logger.info('');
  logger.info('🔗 Useful Links:');
  logger.info(`  • CodeBuild Console: https://console.aws.amazon.com/codesuite/codebuild/projects/${projectName}`);
  logger.info(`  • GitHub Repository: https://github.com/${config.github.repository}`);
  logger.info('  • CloudWatch Logs: https://console.aws.amazon.com/cloudwatch/home#logsV2:log-groups');
  logger.info('');
  logger.info('💡 Troubleshooting:');
  logger.info('  • If webhook doesn\'t trigger, check GitHub webhook settings');
  logger.info('  • If builds fail, check CloudWatch logs for details');
  logger.info('  • Use GitHub Actions workflow as fallback if needed');
  logger.info('  • Ensure GitHub token has required scopes (repo, repo:status)');
}

/**
 * Main execution function
 */
async function main() {
  try {
    logger.info('🚀 Starting CodeBuild setup for GitHub webhook integration...');
    logger.info('');
    
    // Load configuration
    logger.info('📋 Loading configuration...');
    const config = await loadConfiguration();
    logger.success('Configuration loaded successfully');
    
    // Get GitHub token
    logger.info('🔑 Checking GitHub token...');
    const githubToken = getGitHubToken();
    logger.success('GitHub token found');
    
    // Create AWS clients
    logger.info('☁️  Initializing AWS clients...');
    const { codebuild, iam, sts } = createAWSClients(config.aws.region, config.aws.profile);
    logger.success('AWS clients initialized');
    
    // Verify AWS credentials
    logger.info('🔐 Verifying AWS credentials...');
    const accountId = await verifyAWSCredentials(sts);
    
    // Set or validate account ID
    if (!config.aws.accountId) {
      logger.info(`Using account ID from AWS credentials: ${accountId}`);
      config.aws.accountId = accountId;
    } else if (accountId !== config.aws.accountId) {
      logger.warn(`Account ID mismatch: config=${config.aws.accountId}, actual=${accountId}`);
      logger.info('Using actual account ID from credentials');
      config.aws.accountId = accountId;
    }
    
    // Create IAM service role
    logger.info('👤 Setting up IAM service role...');
    const serviceRoleArn = await createServiceRole(iam, config.aws.accountId, config.aws.region, config.codeartifact.domain);
    
    // Create/update CodeBuild project
    logger.info('🏗️  Creating CodeBuild project...');
    const projectName = await createCodeBuildProject(codebuild, config, serviceRoleArn, githubToken);
    
    // Configure webhook
    logger.info('🔗 Configuring GitHub webhook...');
    const webhook = await configureWebhook(codebuild, projectName);
    
    // Test functionality
    logger.info('🧪 Testing project functionality...');
    const buildId = await testWebhookFunctionality(codebuild, projectName, config);
    
    // Display summary
    displaySummary(config, projectName, webhook.url, buildId);
    
    process.exit(0);
    
  } catch (error) {
    logger.error('❌ CodeBuild setup failed:', error.message);
    
    if (process.env.DEBUG) {
      logger.debug('Stack trace:', error.stack);
    }
    
    logger.info('');
    logger.info('🔧 Common issues and solutions:');
    logger.info('  • AWS credentials: Run `aws configure` or set AWS_PROFILE');
    logger.info('  • GitHub token: Set GITHUB_TOKEN environment variable');
    logger.info('  • Permissions: Ensure IAM user has CodeBuild and IAM permissions');
    logger.info('  • Repository: Verify GitHub repository name in config');
    
    process.exit(1);
  }
}

// Export functions for testing
export {
  loadConfiguration,
  createServiceRole,
  createCodeBuildProject,
  configureWebhook,
  testWebhookFunctionality,
  main
};

// Run main function if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}