#!/usr/bin/env node

/**
 * Cleanup script to remove old CodeArtifact resources (myapp domain and repository)
 * Run this before setting up with new myorg names
 */

import { CodeartifactClient, DeleteRepositoryCommand, DeleteDomainCommand } from '@aws-sdk/client-codeartifact';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

const OLD_DOMAIN = 'myapp';
const OLD_REPOSITORY = 'myapp-repo';
const REGION = process.env.AWS_REGION || 'eu-west-1';

/**
 * Get AWS Account ID from STS
 */
async function getAwsAccountId() {
  try {
    const stsClient = new STSClient({ region: REGION });
    const response = await stsClient.send(new GetCallerIdentityCommand({}));
    return response.Account;
  } catch (error) {
    throw new Error(`Failed to retrieve AWS Account ID: ${error.message}`);
  }
}

const client = new CodeartifactClient({ region: REGION });

async function cleanup() {
  console.log('🧹 Cleaning up old CodeArtifact resources...\n');

  try {
    // Get AWS Account ID
    console.log('Retrieving AWS Account ID...');
    const accountId = await getAwsAccountId();
    console.log(`✅ AWS Account ID: ${accountId}\n`);

    // Step 1: Delete old repository
    console.log(`Deleting repository: ${OLD_REPOSITORY}...`);
    try {
      await client.send(new DeleteRepositoryCommand({
        domain: OLD_DOMAIN,
        repository: OLD_REPOSITORY
      }));
      console.log(`✅ Repository ${OLD_REPOSITORY} deleted successfully\n`);
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        console.log(`ℹ️  Repository ${OLD_REPOSITORY} does not exist (already deleted)\n`);
      } else {
        throw error;
      }
    }

    // Step 2: Delete old domain
    console.log(`Deleting domain: ${OLD_DOMAIN}...`);
    try {
      await client.send(new DeleteDomainCommand({
        domain: OLD_DOMAIN
      }));
      console.log(`✅ Domain ${OLD_DOMAIN} deleted successfully\n`);
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        console.log(`ℹ️  Domain ${OLD_DOMAIN} does not exist (already deleted)\n`);
      } else {
        throw error;
      }
    }

    console.log('✅ Cleanup complete!\n');
    console.log('You can now run: npm run setup');
    console.log('This will create the new myorg domain and myorg-repo repository\n');

  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    console.error('\nIf you see permission errors, ensure your AWS credentials have:');
    console.error('  - codeartifact:DeleteRepository');
    console.error('  - codeartifact:DeleteDomain');
    console.error('  - sts:GetCallerIdentity\n');
    process.exit(1);
  }
}

cleanup();
