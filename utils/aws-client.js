import {
  CodeartifactClient,
  CreateDomainCommand,
  CreateRepositoryCommand,
  AssociateExternalConnectionCommand,
  GetAuthorizationTokenCommand,
  GetRepositoryEndpointCommand,
  DescribeDomainCommand,
  DescribeRepositoryCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-codeartifact';

/**
 * AWS CodeArtifact Client Wrapper
 * Provides simplified interface to AWS CodeArtifact operations
 */
class AWSCodeArtifactClient {
  /**
   * @param {string} region - AWS region (e.g., 'eu-west-1')
   * @param {string} accountId - AWS account ID
   */
  constructor(region, accountId) {
    this.region = region;
    this.accountId = accountId;
    this.client = new CodeartifactClient({ region });
  }

  /**
   * Create a CodeArtifact domain
   * @param {string} domainName - Name of the domain to create
   * @returns {Promise<Object>} Domain creation result
   */
  async createDomain(domainName) {
    try {
      const command = new CreateDomainCommand({
        domain: domainName,
      });
      
      const response = await this.client.send(command);
      return {
        success: true,
        domain: response.domain,
        created: true,
      };
    } catch (error) {
      // Handle case where domain already exists
      if (error.name === 'ResourceAlreadyExistsException') {
        return {
          success: true,
          created: false,
          message: `Domain ${domainName} already exists`,
        };
      }
      
      throw error;
    }
  }

  /**
   * Create a CodeArtifact repository
   * @param {string} domainName - Name of the domain
   * @param {string} repositoryName - Name of the repository to create
   * @returns {Promise<Object>} Repository creation result
   */
  async createRepository(domainName, repositoryName) {
    try {
      const command = new CreateRepositoryCommand({
        domain: domainName,
        repository: repositoryName,
        description: `Repository for ${repositoryName}`,
      });
      
      const response = await this.client.send(command);
      return {
        success: true,
        repository: response.repository,
        created: true,
      };
    } catch (error) {
      // Handle case where repository already exists
      if (error.name === 'ResourceAlreadyExistsException') {
        return {
          success: true,
          created: false,
          message: `Repository ${repositoryName} already exists`,
        };
      }
      
      throw error;
    }
  }

  /**
   * Associate an external connection to a repository
   * @param {string} domainName - Name of the domain
   * @param {string} repositoryName - Name of the repository
   * @param {string} externalConnection - External connection name (e.g., 'public:npmjs')
   * @returns {Promise<Object>} Association result
   */
  async associateExternalConnection(domainName, repositoryName, externalConnection) {
    try {
      const command = new AssociateExternalConnectionCommand({
        domain: domainName,
        repository: repositoryName,
        externalConnection,
      });
      
      const response = await this.client.send(command);
      return {
        success: true,
        repository: response.repository,
      };
    } catch (error) {
      // Handle case where connection already exists
      if (error.name === 'ResourceAlreadyExistsException') {
        return {
          success: true,
          message: `External connection ${externalConnection} already associated`,
        };
      }
      
      throw error;
    }
  }

  /**
   * Get an authorization token for CodeArtifact
   * @param {string} domainName - Name of the domain
   * @param {number} durationSeconds - Token validity duration (default: 43200 = 12 hours)
   * @returns {Promise<Object>} Authorization token result
   */
  async getAuthorizationToken(domainName, durationSeconds = 43200) {
    const command = new GetAuthorizationTokenCommand({
      domain: domainName,
      durationSeconds,
    });
    
    const response = await this.client.send(command);
    return {
      authorizationToken: response.authorizationToken,
      expiration: response.expiration,
    };
  }

  /**
   * Get the repository endpoint URL
   * @param {string} domainName - Name of the domain
   * @param {string} repositoryName - Name of the repository
   * @param {string} format - Package format (default: 'npm')
   * @returns {Promise<string>} Repository endpoint URL
   */
  async getRepositoryEndpoint(domainName, repositoryName, format = 'npm') {
    const command = new GetRepositoryEndpointCommand({
      domain: domainName,
      repository: repositoryName,
      format,
    });
    
    const response = await this.client.send(command);
    return response.repositoryEndpoint;
  }

  /**
   * Check if a domain exists
   * @param {string} domainName - Name of the domain
   * @returns {Promise<boolean>} True if domain exists
   */
  async domainExists(domainName) {
    try {
      const command = new DescribeDomainCommand({
        domain: domainName,
      });
      
      await this.client.send(command);
      return true;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Check if a repository exists
   * @param {string} domainName - Name of the domain
   * @param {string} repositoryName - Name of the repository
   * @returns {Promise<boolean>} True if repository exists
   */
  async repositoryExists(domainName, repositoryName) {
    try {
      const command = new DescribeRepositoryCommand({
        domain: domainName,
        repository: repositoryName,
      });
      
      await this.client.send(command);
      return true;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Check if a repository has a specific external connection
   * @param {string} domainName - Name of the domain
   * @param {string} repositoryName - Name of the repository
   * @param {string} externalConnection - External connection name to check
   * @returns {Promise<boolean>} True if external connection exists
   */
  async hasExternalConnection(domainName, repositoryName, externalConnection) {
    try {
      const command = new DescribeRepositoryCommand({
        domain: domainName,
        repository: repositoryName,
      });
      
      const response = await this.client.send(command);
      const externalConnections = response.repository?.externalConnections || [];
      
      return externalConnections.some(
        conn => conn.externalConnectionName === externalConnection
      );
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        return false;
      }
      throw error;
    }
  }
}

export default AWSCodeArtifactClient;
