#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.join(__dirname, '..');

/**
 * Load configuration from codeartifact-config.json
 * @returns {Object} Configuration object
 */
function loadConfig() {
  const configPath = path.join(rootDir, '..', 'codeartifact-config.json');
  
  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file not found at ${configPath}`);
  }
  
  try {
    const configContent = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configContent);
  } catch (error) {
    throw new Error(`Failed to load configuration: ${error.message}`);
  }
}

/**
 * Get registry URL from command-line argument or config file
 * @returns {string} Registry URL
 */
function getRegistryUrl() {
  // Check for command-line argument
  const args = process.argv.slice(2);
  const registryArg = args.find(arg => arg.startsWith('--registry='));
  
  if (registryArg) {
    return registryArg.split('=')[1];
  }
  
  // Fall back to config file
  try {
    const config = loadConfig();
    const { region, accountId } = config.aws;
    const { domain, repository } = config.codeartifact;
    
    // Construct CodeArtifact registry URL
    return `https://${domain}-${accountId}.d.codeartifact.${region}.amazonaws.com/npm/${repository}/`;
  } catch (error) {
    console.error('Error loading registry URL from config:', error.message);
    throw error;
  }
}

/**
 * Update package.json files with CodeArtifact registry
 * @param {string} packagePath - Path to package directory
 * @param {string} registryUrl - CodeArtifact registry URL
 */
function updatePackageJson(packagePath, registryUrl) {
  const packageJsonPath = path.join(packagePath, 'package.json');
  
  if (!fs.existsSync(packageJsonPath)) {
    console.log(`Skipping ${packagePath} - no package.json found`);
    return;
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // Update or add publishConfig with CodeArtifact registry
    packageJson.publishConfig = {
      registry: registryUrl
    };
    
    // Remove private flag if it exists
    if (packageJson.private) {
      delete packageJson.private;
    }
    
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    console.log(`Updated ${packageJsonPath}`);
  } catch (error) {
    console.error(`Error updating ${packageJsonPath}:`, error.message);
  }
}

// Main execution
try {
  const registryUrl = getRegistryUrl();
  console.log(`Configuring packages with registry: ${registryUrl}`);
  
  // Update all service packages
  const servicesDir = path.join(rootDir, 'services');
  const servicePackages = fs.readdirSync(servicesDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory() && dirent.name !== 'node_modules')
    .map(dirent => path.join(servicesDir, dirent.name));

  console.log('Updating service packages...');
  servicePackages.forEach(pkg => updatePackageJson(pkg, registryUrl));
  
  // Update services aggregate package
  console.log('Updating services aggregate package...');
  updatePackageJson(servicesDir, registryUrl);

  // Update all utility packages
  const utilitiesDir = path.join(rootDir, 'utilities');
  const utilityPackages = fs.readdirSync(utilitiesDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory() && dirent.name !== 'node_modules')
    .map(dirent => path.join(utilitiesDir, dirent.name));

  console.log('Updating utility packages...');
  utilityPackages.forEach(pkg => updatePackageJson(pkg, registryUrl));
  
  // Update utilities aggregate package
  console.log('Updating utilities aggregate package...');
  updatePackageJson(utilitiesDir, registryUrl);
  
  // Update root my-lib package
  console.log('Updating root package...');
  updatePackageJson(rootDir, registryUrl);

  console.log('Package configuration complete!');
} catch (error) {
  console.error('Configuration failed:', error.message);
  process.exit(1);
}