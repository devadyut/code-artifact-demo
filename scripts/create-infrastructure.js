import AWSCodeArtifactClient from '../utils/aws-client.js';
import logger from '../utils/logger.js';

/**
 * Ensure a CodeArtifact domain exists (idempotent)
 * @param {AWSCodeArtifactClient} client - AWS CodeArtifact client instance
 * @param {string} domainName - Name of the domain to create
 * @returns {Promise<Object>} Result object with success status and details
 */
async function ensureDomain(client, domainName) {
  try {
    logger.step(`Checking if domain "${domainName}" exists...`);
    
    const exists = await client.domainExists(domainName);
    
    if (exists) {
      logger.info(`Domain "${domainName}" already exists`);
      return {
        success: true,
        created: false,
        exists: true,
        domainName,
      };
    }
    
    logger.step(`Creating domain "${domainName}"...`);
    const result = await client.createDomain(domainName);
    
    if (result.success) {
      logger.success(`Domain "${domainName}" created successfully`);
      return {
        success: true,
        created: true,
        exists: false,
        domainName,
        domain: result.domain,
      };
    }
    
    throw new Error('Domain creation failed without error');
  } catch (error) {
    logger.error(`Failed to ensure domain "${domainName}": ${error.message}`);
    throw error;
  }
}

/**
 * Ensure a CodeArtifact repository exists (idempotent)
 * @param {AWSCodeArtifactClient} client - AWS CodeArtifact client instance
 * @param {string} domainName - Name of the domain
 * @param {string} repositoryName - Name of the repository to create
 * @returns {Promise<Object>} Result object with success status and details
 */
async function ensureRepository(client, domainName, repositoryName) {
  try {
    logger.step(`Checking if repository "${repositoryName}" exists in domain "${domainName}"...`);
    
    const exists = await client.repositoryExists(domainName, repositoryName);
    
    if (exists) {
      logger.info(`Repository "${repositoryName}" already exists`);
      return {
        success: true,
        created: false,
        exists: true,
        repositoryName,
      };
    }
    
    logger.step(`Creating repository "${repositoryName}" in domain "${domainName}"...`);
    const result = await client.createRepository(domainName, repositoryName);
    
    if (result.success) {
      logger.success(`Repository "${repositoryName}" created successfully`);
      return {
        success: true,
        created: true,
        exists: false,
        repositoryName,
        repository: result.repository,
      };
    }
    
    throw new Error('Repository creation failed without error');
  } catch (error) {
    logger.error(`Failed to ensure repository "${repositoryName}": ${error.message}`);
    throw error;
  }
}

/**
 * Associate external connection to repository (idempotent)
 * @param {AWSCodeArtifactClient} client - AWS CodeArtifact client instance
 * @param {string} domainName - Name of the domain
 * @param {string} repositoryName - Name of the repository
 * @param {string} externalConnection - External connection name (e.g., 'public:npmjs')
 * @returns {Promise<Object>} Result object with success status and details
 */
async function ensureExternalConnection(client, domainName, repositoryName, externalConnection) {
  try {
    logger.step(`Checking if external connection "${externalConnection}" is associated...`);
    
    const hasConnection = await client.hasExternalConnection(domainName, repositoryName, externalConnection);
    
    if (hasConnection) {
      logger.info(`External connection "${externalConnection}" already associated`);
      return {
        success: true,
        created: false,
        exists: true,
        externalConnection,
      };
    }
    
    logger.step(`Associating external connection "${externalConnection}"...`);
    const result = await client.associateExternalConnection(domainName, repositoryName, externalConnection);
    
    if (result.success) {
      logger.success(`External connection "${externalConnection}" associated successfully`);
      return {
        success: true,
        created: true,
        exists: false,
        externalConnection,
        repository: result.repository,
      };
    }
    
    throw new Error('External connection association failed without error');
  } catch (error) {
    logger.error(`Failed to associate external connection "${externalConnection}": ${error.message}`);
    throw error;
  }
}

/**
 * Create complete CodeArtifact infrastructure (domain, repository, external connection)
 * @param {Object} config - Configuration object
 * @param {Object} config.aws - AWS configuration
 * @param {string} config.aws.region - AWS region
 * @param {string} config.aws.accountId - AWS account ID
 * @param {Object} config.codeartifact - CodeArtifact configuration
 * @param {string} config.codeartifact.domain - Domain name
 * @param {string} config.codeartifact.repository - Repository name
 * @param {string} config.codeartifact.externalConnection - External connection name
 * @returns {Promise<Object>} Result object with all operation results
 */
async function createInfrastructure(config) {
  try {
    logger.section('Creating CodeArtifact Infrastructure');
    
    // Validate configuration
    if (!config?.aws?.region || !config?.aws?.accountId) {
      throw new Error('Missing required AWS configuration (region, accountId)');
    }
    
    if (!config?.codeartifact?.domain || !config?.codeartifact?.repository) {
      throw new Error('Missing required CodeArtifact configuration (domain, repository)');
    }
    
    const { region, accountId } = config.aws;
    const { domain, repository, externalConnection } = config.codeartifact;
    
    logger.info(`Region: ${region}`);
    logger.info(`Account ID: ${accountId}`);
    logger.info(`Domain: ${domain}`);
    logger.info(`Repository: ${repository}`);
    if (externalConnection) {
      logger.info(`External Connection: ${externalConnection}`);
    }
    
    // Initialize AWS client
    const client = new AWSCodeArtifactClient(region, accountId);
    
    // Ensure domain exists
    const domainResult = await ensureDomain(client, domain);
    
    // Ensure repository exists
    const repositoryResult = await ensureRepository(client, domain, repository);
    
    // Associate external connection if specified
    let externalConnectionResult = null;
    if (externalConnection) {
      externalConnectionResult = await ensureExternalConnection(
        client,
        domain,
        repository,
        externalConnection
      );
    }
    
    logger.section('Infrastructure Setup Complete');
    
    return {
      success: true,
      domain: domainResult,
      repository: repositoryResult,
      externalConnection: externalConnectionResult,
    };
  } catch (error) {
    // Handle specific AWS errors
    if (error.name === 'CredentialsProviderError' || error.name === 'UnrecognizedClientException') {
      logger.error('AWS credentials are not configured or invalid');
      logger.error('Please configure AWS CLI with: aws configure');
      throw new Error('AWS authentication failed: Invalid or missing credentials');
    }
    
    if (error.name === 'AccessDeniedException') {
      logger.error('Insufficient IAM permissions for CodeArtifact operations');
      logger.error('Required permissions: codeartifact:CreateDomain, codeartifact:CreateRepository, codeartifact:AssociateExternalConnection');
      throw new Error('AWS authorization failed: Insufficient permissions');
    }
    
    if (error.name === 'ValidationException') {
      logger.error('Invalid configuration values provided');
      throw new Error(`AWS validation failed: ${error.message}`);
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      logger.error('Network error connecting to AWS');
      throw new Error('Network error: Unable to connect to AWS services');
    }
    
    // Re-throw with context
    logger.error(`Infrastructure creation failed: ${error.message}`);
    throw error;
  }
}

export {
  createInfrastructure,
  ensureDomain,
  ensureRepository,
  ensureExternalConnection,
};
