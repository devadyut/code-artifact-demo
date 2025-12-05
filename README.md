# AWS CodeArtifact Setup

This comprehensive guide explains how to set up AWS CodeArtifact for hosting private npm packages, configure consumer applications, and integrate with CI/CD pipelines.

## Table of Contents

- [Quick Start](#quick-start)
- [What Gets Created](#what-gets-created)
- [Configuration File Reference](#configuration-file-reference)
- [AWS IAM Permissions](#aws-iam-permissions)
- [Token Refresh for CI/CD](#token-refresh-for-cicd)
- [External Repository Benefits](#external-repository-benefits)
- [CI/CD Integration](#cicd-integration)
- [Using the Packages](#using-the-packages)
- [Troubleshooting](#troubleshooting)
- [Security Best Practices](#security-best-practices)

## Quick Start

### Prerequisites

- Node.js 18+ installed
- AWS CLI configured with appropriate credentials
- AWS account with CodeArtifact permissions (see [IAM Permissions](#aws-iam-permissions))
- Git (for version control)

### Configuration

**Option A: Automatic (Recommended)**

The setup script will automatically retrieve your AWS Account ID from your configured AWS credentials. No manual configuration needed!

**Option B: Using .env file**

```bash
cp .env.example .env
# Edit .env and add your AWS Account ID (optional)
```

**Option C: Export environment variables (for CI/CD)**

```bash
export AWS_ACCOUNT_ID=123456789012
```

### Run Setup

```bash
npm install
npm run setup
```

**Note**: The setup script will automatically retrieve your AWS Account ID from your AWS credentials if not provided.

This single command will:
- ✅ Retrieve AWS Account ID (if not set)
- ✅ Create CodeArtifact domain and repository
- ✅ Associate external connection to npmjs.com
- ✅ Generate authorization token
- ✅ Publish all packages from my-lib
- ✅ Generate .npmrc files for individual service folders

## What Gets Created

### AWS Resources

- **Domain**: `myorg` (in your configured region)
- **Repository**: `myorg-repo` with npm format
- **External Connection**: `public:npmjs` for caching public packages

### Published Packages

All packages under `my-lib/` are published with the `@myorg` scope:
- **Services**: `@myorg/database`, `@myorg/storage`, `@myorg/services`
- **Utilities**: `@myorg/array`, `@myorg/constants`, `@myorg/date`, `@myorg/error`, `@myorg/logger`, `@myorg/middleware`, `@myorg/response`, `@myorg/validation`, `@myorg/utilities`
- **Main**: `@myorg/libraries`

### Consumer Configuration

`.npmrc` files are generated in individual service folders:
- `my-api/auth/.npmrc` - Configured to install from CodeArtifact
- `my-api/core/.npmrc` - Configured to install from CodeArtifact
- `my-ui/.npmrc` - Configured to install from CodeArtifact

### Idempotency

The setup script is fully idempotent - you can run it multiple times safely:
- Existing infrastructure is reused
- Existing package versions are skipped
- Auth tokens are regenerated (they expire after 12 hours)
- .npmrc files are updated with fresh tokens

## Configuration File Reference

The `codeartifact-config.json` file controls all aspects of the setup:

```json
{
  "aws": {
    "region": "eu-west-1",
    "accountId": "${AWS_ACCOUNT_ID}",
    "profile": "default"
  },
  "codeartifact": {
    "domain": "myorg",
    "repository": "myorg-repo",
    "scope": "@myorg",
    "externalConnection": "public:npmjs"
  },
  "github": {
    "repository": "code-artifact-demo"
  },
  "paths": {
    "sharedLibs": "./my-lib",
    "consumers": ["./my-api/auth", "./my-api/core", "./my-ui"]
  }
}
```

### Configuration Options Explained

#### aws.region
- **Type**: String | **Required**: Yes
- **Description**: AWS region where CodeArtifact resources will be created
- **Examples**: `us-east-1`, `eu-west-1`, `ap-southeast-1`
- **Note**: Choose a region close to your development team for lower latency

#### aws.accountId
- **Type**: String | **Required**: Yes (but auto-retrieved if not set)
- **Description**: Your 12-digit AWS account ID
- **Format**: Can use environment variable syntax `${ENV_VAR_NAME}`
- **Auto-retrieval**: If `${AWS_ACCOUNT_ID}` is used and not set, the setup script will automatically retrieve it from AWS STS
- **Security**: Never hardcode this value; always use environment variables or auto-retrieval
- **Manual retrieval**: Run `aws sts get-caller-identity --query Account --output text`

#### aws.profile
- **Type**: String | **Required**: No | **Default**: `default`
- **Description**: AWS CLI profile to use for authentication
- **Use case**: Useful when managing multiple AWS accounts locally

#### codeartifact.domain
- **Type**: String | **Required**: Yes
- **Description**: Name of the CodeArtifact domain (container for repositories)
- **Constraints**: 2-50 characters, lowercase letters/numbers/hyphens, must start with letter or number
- **Note**: Domain names must be unique within your AWS account and region

#### codeartifact.repository
- **Type**: String | **Required**: Yes
- **Description**: Name of the repository within the domain
- **Constraints**: Same as domain name constraints
- **Note**: Repository names must be unique within a domain

#### codeartifact.scope
- **Type**: String | **Required**: Yes
- **Description**: npm scope for your private packages
- **Format**: Must start with `@` (e.g., `@myorg`, `@mycompany`)
- **Purpose**: Namespaces your packages and simplifies registry configuration

#### codeartifact.externalConnection
- **Type**: String | **Required**: No | **Default**: `public:npmjs`
- **Description**: External repository connection for caching public packages
- **Options**: `public:npmjs` (npm), `public:pypi` (Python), `public:maven-central` (Java)
- **Benefits**: See [External Repository Benefits](#external-repository-benefits)

#### paths.sharedLibs
- **Type**: String | **Required**: Yes | **Default**: `./my-lib`
- **Description**: Relative or absolute path to the shared libraries directory
- **Note**: This directory should contain subdirectories with package.json files

#### paths.consumers
- **Type**: Array of Strings | **Required**: Yes | **Default**: `["./my-api/auth", "./my-api/core", "./my-ui"]`
- **Description**: List of paths to consumer service folders that will install packages
- **Note**: .npmrc files will be generated in each of these directories (individual service folders, not root application folders)

### Environment Variable Substitution

The configuration file supports environment variable substitution:

```json
{
  "aws": {
    "accountId": "${AWS_ACCOUNT_ID}",
    "region": "${AWS_REGION:-eu-west-1}"
  }
}
```

**Supported formats**:
- `${VAR}` - Required variable (fails if not set)
- `${VAR:-default}` - Optional variable with default value

## AWS IAM Permissions

### Required Permissions for Local Development

For developers running the setup script locally:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CodeArtifactDomainManagement",
      "Effect": "Allow",
      "Action": [
        "codeartifact:CreateDomain",
        "codeartifact:DescribeDomain",
        "codeartifact:GetDomainPermissionsPolicy",
        "codeartifact:ListDomains"
      ],
      "Resource": "arn:aws:codeartifact:*:*:domain/myorg"
    },
    {
      "Sid": "CodeArtifactRepositoryManagement",
      "Effect": "Allow",
      "Action": [
        "codeartifact:CreateRepository",
        "codeartifact:DescribeRepository",
        "codeartifact:GetRepositoryEndpoint",
        "codeartifact:ListRepositories",
        "codeartifact:ListRepositoriesInDomain",
        "codeartifact:AssociateExternalConnection",
        "codeartifact:DisassociateExternalConnection",
        "codeartifact:ListExternalConnections"
      ],
      "Resource": "arn:aws:codeartifact:*:*:repository/myorg/myorg-repo"
    },
    {
      "Sid": "CodeArtifactPackagePublishing",
      "Effect": "Allow",
      "Action": [
        "codeartifact:PublishPackageVersion",
        "codeartifact:PutPackageMetadata",
        "codeartifact:ReadFromRepository"
      ],
      "Resource": "arn:aws:codeartifact:*:*:package/myorg/myorg-repo/*/*"
    },
    {
      "Sid": "CodeArtifactTokenGeneration",
      "Effect": "Allow",
      "Action": ["codeartifact:GetAuthorizationToken"],
      "Resource": "arn:aws:codeartifact:*:*:domain/myorg"
    },
    {
      "Sid": "STSServiceBearerToken",
      "Effect": "Allow",
      "Action": ["sts:GetServiceBearerToken"],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "sts:AWSServiceName": "codeartifact.amazonaws.com"
        }
      }
    }
  ]
}
```

### Required Permissions for AWS CodeBuild

For AWS CodeBuild projects that build and publish packages:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CodeArtifactRead",
      "Effect": "Allow",
      "Action": [
        "codeartifact:DescribeDomain",
        "codeartifact:DescribeRepository",
        "codeartifact:GetRepositoryEndpoint",
        "codeartifact:ListRepositoriesInDomain",
        "codeartifact:ReadFromRepository"
      ],
      "Resource": [
        "arn:aws:codeartifact:*:*:domain/myorg",
        "arn:aws:codeartifact:*:*:repository/myorg/myorg-repo"
      ]
    },
    {
      "Sid": "CodeArtifactPublish",
      "Effect": "Allow",
      "Action": [
        "codeartifact:PublishPackageVersion",
        "codeartifact:PutPackageMetadata"
      ],
      "Resource": "arn:aws:codeartifact:*:*:package/myorg/myorg-repo/*/*"
    },
    {
      "Sid": "CodeArtifactTokenGeneration",
      "Effect": "Allow",
      "Action": ["codeartifact:GetAuthorizationToken"],
      "Resource": "arn:aws:codeartifact:*:*:domain/myorg"
    },
    {
      "Sid": "STSServiceBearerToken",
      "Effect": "Allow",
      "Action": ["sts:GetServiceBearerToken"],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "sts:AWSServiceName": "codeartifact.amazonaws.com"
        }
      }
    },
    {
      "Sid": "STSGetCallerIdentity",
      "Effect": "Allow",
      "Action": ["sts:GetCallerIdentity"],
      "Resource": "*"
    }
  ]
}
```

### Permission Notes

- **Domain and Repository ARNs**: Replace `myorg` and `myorg-repo` with your actual names if different
- **Region Wildcard**: The `*` in region allows operations across all regions. Restrict to specific regions (e.g., `eu-west-1`) for tighter security
- **Least Privilege**: These policies follow the principle of least privilege
- **STS Bearer Token**: Required for CodeArtifact authentication via AWS STS

### Creating an IAM Policy

1. Go to IAM Console → Policies → Create Policy
2. Choose JSON tab and paste the policy above
3. Name it `CodeArtifactSetupPolicy` or `CodeArtifactCodeBuildPolicy`
4. Attach to your IAM user or CodeBuild service role

## Token Refresh for CI/CD

CodeArtifact authorization tokens expire after **12 hours**. This section explains how to handle token refresh in CI/CD pipelines.

### Understanding Token Expiration

- **Token Lifetime**: 12 hours (43,200 seconds) - maximum allowed by AWS
- **Token Scope**: Tokens are scoped to a specific domain
- **Token Usage**: Required for both publishing and installing packages
- **Security**: Tokens should never be committed to version control

### Strategy 1: Generate Fresh Tokens on Every Build (Recommended)

This is the simplest and most secure approach for CI/CD pipelines.

**AWS CodeBuild Example**:

```yaml
version: 0.2

phases:
  pre_build:
    commands:
      - echo "Generating fresh CodeArtifact token..."
      - export CODEARTIFACT_AUTH_TOKEN=$(aws codeartifact get-authorization-token --domain myorg --query authorizationToken --output text)
      - export CODEARTIFACT_REGISTRY=$(aws codeartifact get-repository-endpoint --domain myorg --repository myorg-repo --format npm --query repositoryEndpoint --output text)
      
  build:
    commands:
      - echo "Installing dependencies..."
      - npm config set registry $CODEARTIFACT_REGISTRY
      - npm config set //$CODEARTIFACT_REGISTRY:_authToken $CODEARTIFACT_AUTH_TOKEN
      - npm install
      
  post_build:
    commands:
      - echo "Publishing packages..."
      - npm run setup
```

**GitHub Actions Example**:

```yaml
- name: Generate CodeArtifact Token
  id: codeartifact
  run: |
    TOKEN=$(aws codeartifact get-authorization-token \
      --domain myorg \
      --query authorizationToken \
      --output text)
    echo "::add-mask::$TOKEN"
    echo "token=$TOKEN" >> $GITHUB_OUTPUT

- name: Configure npm
  run: |
    npm config set registry https://myorg-123456789012.d.codeartifact.eu-west-1.amazonaws.com/npm/myorg-repo/
    npm config set //myorg-123456789012.d.codeartifact.eu-west-1.amazonaws.com/npm/myorg-repo/:_authToken ${{ steps.codeartifact.outputs.token }}
```

### Strategy 2: Token Refresh Script for Long-Running Processes

For long-running CI/CD processes (>12 hours), implement a token refresh mechanism:

**refresh-token.sh**:

```bash
#!/bin/bash

DOMAIN="myorg"
REGION="eu-west-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

while true; do
  echo "Refreshing CodeArtifact token..."
  
  TOKEN=$(aws codeartifact get-authorization-token \
    --domain $DOMAIN \
    --query authorizationToken \
    --output text)
  
  REGISTRY="https://myorg-${ACCOUNT_ID}.d.codeartifact.${REGION}.amazonaws.com/npm/myorg-repo/"
  
  for dir in my-api/auth my-api/core my-ui; do
    if [ -d "$dir" ]; then
      echo "@myorg:registry=$REGISTRY" > "$dir/.npmrc"
      echo "${REGISTRY#https:}:_authToken=$TOKEN" >> "$dir/.npmrc"
      echo "Updated $dir/.npmrc"
    fi
  done
  
  echo "Token refreshed. Sleeping for 11 hours..."
  sleep 39600
done
```

**Usage**:

```bash
./refresh-token.sh &
REFRESH_PID=$!

# Run your long-running process
npm run build
npm run test

kill $REFRESH_PID
```

### Strategy 3: Scheduled Token Refresh (Jenkins)

```groovy
pipeline {
  agent any
  
  triggers {
    cron('0 */11 * * *')  // Every 11 hours
  }
  
  stages {
    stage('Refresh Token') {
      steps {
        script {
          sh '''
            export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
            npm run setup
          '''
        }
      }
    }
  }
}
```

### Token Refresh Best Practices

1. **Generate Fresh Tokens**: Always generate a new token at the start of each CI/CD run
2. **Never Cache Tokens**: Don't store tokens in CI/CD variables or cache
3. **Use IAM Roles**: Prefer IAM roles over access keys for token generation
4. **Monitor Expiration**: Set up alerts for token expiration in long-running processes
5. **Refresh Early**: Refresh tokens before they expire (e.g., at 11 hours instead of 12)
6. **Mask Tokens**: Always mask tokens in CI/CD logs to prevent exposure
7. **Audit Token Usage**: Enable CloudTrail logging for GetAuthorizationToken API calls

## External Repository Benefits

The external connection to `public:npmjs` provides significant benefits for your development workflow.

### What is an External Connection?

An external connection allows your CodeArtifact repository to fetch and cache packages from public repositories like npmjs.com. When you request a package:

1. CodeArtifact first checks if the package exists in your private repository
2. If not found, it fetches from the external connection (npmjs.com)
3. The package is cached in your CodeArtifact repository
4. Subsequent requests are served from the cache

### Key Benefits

#### 1. Faster Package Installation (10x Speed Improvement)

- **Reduced Latency**: Packages served from AWS infrastructure close to your region
- **Cached Locally**: After first fetch, packages install from your CodeArtifact repository
- **No External Dependency**: Once cached, installations work even if npmjs.com is down

**Performance Comparison**:
```
Without CodeArtifact:
npm install lodash  →  npmjs.com (200-500ms)

With CodeArtifact (first time):
npm install lodash  →  npmjs.com → CodeArtifact cache (200-500ms)

With CodeArtifact (cached):
npm install lodash  →  CodeArtifact cache (20-50ms)  ✨ 10x faster!
```

#### 2. Improved Reliability

- **High Availability**: AWS CodeArtifact has 99.9% SLA
- **Resilience**: Continue working even during npmjs.com outages
- **Consistent Versions**: Cached packages remain available even if removed from npmjs.com
- **No Rate Limiting**: Avoid npmjs.com rate limits on public package downloads

**Real-world scenario**:
```
March 2023: npmjs.com experienced a 4-hour outage
- Teams without CodeArtifact: Unable to install dependencies ❌
- Teams with CodeArtifact: Continued working with cached packages ✅
```

#### 3. Cost Optimization

- **Reduced Data Transfer**: Pay only once for package downloads from npmjs.com
- **Shared Cache**: All teams in your organization share the same cache
- **Lower Bandwidth Costs**: Especially beneficial for large packages or frequent installs

**Cost Example**:
```
Scenario: 10 developers, each running npm install 5 times/day
Package size: 100MB total dependencies

Without CodeArtifact:
- Downloads: 10 devs × 5 installs × 100MB = 5GB/day
- Monthly: 5GB × 20 days = 100GB

With CodeArtifact:
- First install: 100MB from npmjs.com
- Subsequent: 0MB from npmjs.com (served from cache)
- Monthly: ~2GB from npmjs.com
- Savings: 98GB/month in external bandwidth
```

#### 4. Enhanced Security

- **Package Scanning**: Integrate with AWS security tools to scan cached packages
- **Audit Trail**: CloudTrail logs all package downloads and usage
- **Version Control**: Control which package versions are available to your team
- **Malware Protection**: Scan packages before they reach developer machines
- **Compliance**: Meet regulatory requirements for software supply chain security

**Security workflow**:
```
1. Package requested from npmjs.com
2. CodeArtifact fetches and caches package
3. Security scanning runs on cached package
4. If vulnerabilities found, package can be blocked
5. Developers only access approved, scanned packages
```

#### 5. Unified Package Management

- **Single Registry**: One registry URL for both private and public packages
- **Simplified Configuration**: One .npmrc file for all package sources
- **Consistent Authentication**: Same auth token for private and public packages
- **Easier Onboarding**: New developers configure once and access everything

**Developer experience**:
```bash
# Without CodeArtifact (multiple registries)
npm config set @myorg:registry https://npm.pkg.github.com/
npm config set registry https://registry.npmjs.org/
# Need different auth for each registry

# With CodeArtifact (single registry)
npm config set registry https://myorg-123456789012.d.codeartifact.eu-west-1.amazonaws.com/npm/myorg-repo/
# One auth token for everything ✨
```

#### 6. Package Version Stability

- **Immutable Cache**: Once cached, package versions cannot be changed
- **Protection from "Unpublish"**: Packages remain available even if author unpublishes from npmjs.com
- **Reproducible Builds**: Guaranteed access to exact package versions over time

**Famous incident**:
```
2016: left-pad package unpublished from npmjs.com
- Broke thousands of projects worldwide
- With CodeArtifact: Cached version remains available ✅
```

### Configuring External Connections

The setup script automatically configures the external connection. To verify:

```bash
aws codeartifact list-external-connections \
  --domain myorg \
  --repository myorg-repo
```

Expected output:
```json
{
  "externalConnections": [
    {
      "externalConnectionName": "public:npmjs",
      "packageFormat": "npm",
      "status": "Available"
    }
  ]
}
```

## CI/CD Integration

### AWS CodeBuild

The `buildspec.yml` file provides a complete example for AWS CodeBuild integration:

```yaml
version: 0.2

phases:
  build:
    commands:
      - echo "Running CodeArtifact setup..."
      - echo "This will install dependencies, create infrastructure, and publish packages"
      - npm run setup

artifacts:
  files:
    - '**/*'
```

**What happens when you run `npm run setup`:**
1. ✅ Installs all npm dependencies automatically
2. ✅ Retrieves AWS Account ID from credentials
3. ✅ Creates CodeArtifact infrastructure
4. ✅ Publishes all packages
5. ✅ Generates .npmrc files

**CodeBuild Project Configuration**:

- **Source**: GitHub repository (code-artifact-demo)
- **Trigger**: Webhook on push to main/production branch
- **Environment**: 
  - Runtime: Node.js 18+
  - Compute: Small (2 vCPUs, 3 GB memory)
- **Service Role**: IAM role with CodeArtifact permissions (see [IAM Permissions](#aws-iam-permissions))

### GitHub Actions

```yaml
name: Publish to CodeArtifact

on:
  push:
    branches: [main]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: eu-west-1
      
      - name: Run CodeArtifact setup
        run: npm run setup
```

### GitLab CI

```yaml
publish:
  image: node:18
  before_script:
    - apt-get update && apt-get install -y awscli
  script:
    - npm run setup
  only:
    - main
```

**Note**: The setup script automatically installs dependencies and retrieves AWS Account ID, so no manual steps are needed!

## Using the Packages

After setup, install packages in your consumer applications:

```bash
cd my-api
npm install @myorg/logger @myorg/database
```

### Available Scripts

- `npm run setup` - Complete setup (infrastructure + publish + configure)
- `node my-lib/scripts/configure-packages.js` - Update package.json files with registry
- `node my-lib/scripts/publish-packages.js all [registryUrl] [authToken]` - Publish packages
- `node scripts/generate-npmrc.js` - Generate .npmrc files

### Manual Steps (if needed)

```bash
# 1. Create infrastructure only
node scripts/create-infrastructure.js

# 2. Publish packages only
cd my-lib
node scripts/publish-packages.js all <registry-url> <auth-token>

# 3. Generate .npmrc files only
node scripts/generate-npmrc.js
```

## Troubleshooting

### "Environment variable AWS_ACCOUNT_ID is not set"

**This should not happen anymore!** The setup script now automatically retrieves your AWS Account ID from your AWS credentials.

If you still see this error:
1. Ensure your AWS credentials are configured: `aws configure`
2. Verify credentials work: `aws sts get-caller-identity`
3. Alternatively, manually set the variable:
   ```bash
   export AWS_ACCOUNT_ID=123456789012
   ```

### "AWS credentials are not configured"

Configure AWS CLI:
```bash
aws configure
```

Verify configuration:
```bash
aws sts get-caller-identity
```

### "Insufficient IAM permissions"

Ensure your AWS user/role has the required permissions. See [AWS IAM Permissions](#aws-iam-permissions) for complete policy examples.

Common missing permissions:
- `codeartifact:CreateDomain`
- `codeartifact:CreateRepository`
- `codeartifact:GetAuthorizationToken`
- `sts:GetServiceBearerToken`

### Token Expired

Auth tokens expire after 12 hours. Re-run the setup to generate fresh tokens:
```bash
npm run setup
```

### "401 Unauthorized" errors

- Token has expired (>12 hours old)
- Token was generated for wrong domain
- Token not properly configured in .npmrc

**Solution**: Regenerate token and update .npmrc:
```bash
export AWS_ACCOUNT_ID=123456789012
npm run setup
```

### "Package already exists" errors

This is normal behavior. The setup script skips packages that already exist in the repository. This is part of the idempotent design.

## Security Best Practices

### 1. Never Commit Sensitive Information

- ✅ `.npmrc` files are gitignored (contain auth tokens)
- ✅ `.env` files are gitignored (contain account IDs)
- ✅ `codeartifact-config.json` uses environment variables (no hardcoded account IDs)
- ✅ `package.json` files have no `publishConfig` (added dynamically)

### 2. Use Environment Variables

Always use environment variables for sensitive configuration:

```bash
# Good ✅
export AWS_ACCOUNT_ID=123456789012
npm run setup

# Bad ❌ - Don't hardcode in config files
{
  "aws": {
    "accountId": "123456789012"
  }
}
```

### 3. Rotate Tokens Regularly

- Tokens expire after 12 hours automatically
- Re-run setup to generate fresh tokens
- Never store tokens in CI/CD variables

### 4. Use IAM Roles in CI/CD

Prefer IAM roles over access keys:

```yaml
# GitHub Actions with OIDC (no access keys needed)
- name: Configure AWS Credentials
  uses: aws-actions/configure-aws-credentials@v2
  with:
    role-to-assume: arn:aws:iam::123456789012:role/GitHubActionsRole
    aws-region: eu-west-1
```

### 5. Enable MFA on AWS Accounts

Require multi-factor authentication for:
- Root account access
- IAM users with CodeArtifact permissions
- Console access to CodeArtifact resources

### 6. Implement Least Privilege IAM Policies

- Grant only the permissions needed for specific tasks
- Use resource-specific ARNs instead of wildcards when possible
- Regularly audit and review IAM policies

### 7. Enable CloudTrail Logging

Monitor CodeArtifact API calls:

```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=GetAuthorizationToken \
  --max-results 10
```

### 8. Scan Packages for Vulnerabilities

Integrate security scanning into your workflow:

```bash
# Use npm audit
npm audit

# Use Snyk or similar tools
snyk test
```

### 9. Restrict Network Access

- Use VPC endpoints for CodeArtifact in production
- Implement network policies to restrict access
- Use AWS PrivateLink for secure connectivity

### 10. Regular Security Audits

- Review IAM policies quarterly
- Audit package access logs
- Monitor for unusual activity
- Keep dependencies up to date

## Git Workflow

The repository is configured to be safe for version control:

- ✅ `codeartifact-config.json` uses environment variables (no account ID hardcoded)
- ✅ All `.npmrc` files are gitignored (contain auth tokens)
- ✅ `.npmrc` backup files are gitignored
- ✅ `package.json` files have no hardcoded registry URLs
- ✅ `.env` is gitignored

### .gitignore Entries

The `.gitignore` includes comprehensive patterns to exclude all sensitive files:

```
# Environment variables
.env

# npmrc files with auth tokens (all locations)
.npmrc
*.npmrc
**/.npmrc
.npmrc.backup.*
**/.npmrc.backup.*

# Dependencies
node_modules/
```

This ensures that `.npmrc` files in any location (root, `my-api/auth`, `my-api/core`, `my-ui`, etc.) and their backups are never committed to version control.

## Additional Resources

- [AWS CodeArtifact Documentation](https://docs.aws.amazon.com/codeartifact/)
- [npm Registry Configuration](https://docs.npmjs.com/cli/v9/using-npm/config)
- [AWS IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [AWS CodeBuild Documentation](https://docs.aws.amazon.com/codebuild/)

## License

Apache-2.0

