#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.join(__dirname, '..');

// ANSI color codes for better output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

// Function to execute command with error handling
function executeCommand(command, directory = rootDir, description = '', ignoreError = false) {
    console.log(`${colors.blue}📦 ${description || `Running: ${command}`}${colors.reset}`);
    
    const originalDir = process.cwd();
    
    try {
        process.chdir(directory);
        const result = execSync(command, { stdio: 'pipe', encoding: 'utf8' });
        console.log(`${colors.green}✅ Success: ${description || command}${colors.reset}`);
        return { success: true, output: result };
    } catch (error) {
        if (!ignoreError) {
            console.error(`${colors.red}❌ Failed: ${description || command}${colors.reset}`);
            console.error(`${colors.red}   Error: ${error.message}${colors.reset}`);
        }
        return { success: false, error: error.message };
    } finally {
        process.chdir(originalDir);
    }
}

// Function to update package.json version
function updatePackageVersion(packagePath, newVersion) {
    const packageJsonPath = path.join(packagePath, 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
        return false;
    }
    
    try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const oldVersion = packageJson.version;
        packageJson.version = newVersion;
        
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
        console.log(`${colors.green}✅ Updated ${packageJson.name}: ${oldVersion} → ${newVersion}${colors.reset}`);
        return true;
    } catch (error) {
        console.error(`${colors.red}❌ Failed to update ${packageJsonPath}: ${error.message}${colors.reset}`);
        return false;
    }
}

// Function to increment version
function incrementVersion(version, type) {
    const parts = version.split('.').map(Number);
    
    switch (type) {
        case 'patch':
            parts[2]++;
            break;
        case 'minor':
            parts[1]++;
            parts[2] = 0;
            break;
        case 'major':
            parts[0]++;
            parts[1] = 0;
            parts[2] = 0;
            break;
        default:
            throw new Error(`Unknown version type: ${type}`);
    }
    
    return parts.join('.');
}

// Function to update dependency versions in aggregate packages
function updateAggregateDependencies(aggregateDir, newVersion, type) {
    const packageJsonPath = path.join(aggregateDir, 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
        console.error(`${colors.red}❌ No package.json found in ${aggregateDir}${colors.reset}`);
        return false;
    }
    
    try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        if (!packageJson.dependencies) {
            console.log(`${colors.yellow}⚠️  No dependencies found in ${packageJson.name}${colors.reset}`);
            return true;
        }
        
        let updatedCount = 0;
        const prefix = type === 'services' ? '@myorg/' : '@myorg/';
        
        // Update all @myorg dependencies to the new version
        for (const [depName, depVersion] of Object.entries(packageJson.dependencies)) {
            if (depName.startsWith(prefix)) {
                const oldVersion = depVersion;
                packageJson.dependencies[depName] = `^${newVersion}`;
                console.log(`${colors.green}   ✅ ${depName}: ${oldVersion} → ^${newVersion}${colors.reset}`);
                updatedCount++;
            }
        }
        
        if (updatedCount > 0) {
            fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
            console.log(`${colors.green}✅ Updated ${updatedCount} dependencies in ${packageJson.name}${colors.reset}`);
        } else {
            console.log(`${colors.yellow}⚠️  No @myorg dependencies found to update in ${packageJson.name}${colors.reset}`);
        }
        
        return true;
    } catch (error) {
        console.error(`${colors.red}❌ Failed to update dependencies in ${packageJsonPath}: ${error.message}${colors.reset}`);
        return false;
    }
}

// Function to check git status
function checkGitStatus() {
    const result = executeCommand('git status --porcelain', rootDir, 'Checking git status', true);
    return result.success && result.output.trim() === '';
}

// Function to commit and tag version
function commitAndTag(version, skipGit = false) {
    if (skipGit) {
        console.log(`${colors.yellow}⚠️  Skipping git operations (--no-git flag)${colors.reset}`);
        return true;
    }
    
    // Add all changes
    const addResult = executeCommand('git add .', rootDir, 'Adding changes to git');
    if (!addResult.success) return false;
    
    // Commit changes
    const commitResult = executeCommand(`git commit -m "chore: bump version to ${version}"`, rootDir, 'Committing version changes');
    if (!commitResult.success) return false;
    
    // Create tag
    const tagResult = executeCommand(`git tag v${version}`, rootDir, `Creating tag v${version}`);
    if (!tagResult.success) return false;
    
    return true;
}

// Main version management function
function manageVersions(versionType, options = {}) {
    console.log(`${colors.bright}${colors.magenta}🚀 My App Libraries - Version Manager${colors.reset}\n`);
    
    const { skipGit = false, dryRun = false } = options;
    
    // Check if we're in the right directory
    const packageJsonPath = path.join(rootDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        console.error(`${colors.red}❌ No package.json found. Are you in the right directory?${colors.reset}`);
        process.exit(1);
    }
    
    // Read current version
    let currentVersion;
    try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        currentVersion = packageJson.version;
        console.log(`${colors.blue}📋 Current version: ${currentVersion}${colors.reset}`);
    } catch (error) {
        console.error(`${colors.red}❌ Error reading package.json: ${error.message}${colors.reset}`);
        process.exit(1);
    }
    
    // Calculate new version
    const newVersion = incrementVersion(currentVersion, versionType);
    console.log(`${colors.green}📋 New version: ${newVersion}${colors.reset}\n`);
    
    if (dryRun) {
        console.log(`${colors.yellow}🔍 DRY RUN - No changes will be made${colors.reset}\n`);
    }
    
    // Check git status if not skipping git
    if (!skipGit && !dryRun) {
        const isClean = checkGitStatus();
        if (!isClean) {
            console.log(`${colors.yellow}⚠️  Git working directory is not clean.${colors.reset}`);
            console.log(`${colors.yellow}   This is normal during development. Continuing...${colors.reset}\n`);
        }
    }
    
    let updateResults = { successful: [], failed: [] };
    
    // 1. Update root package
    console.log(`${colors.bright}1. Updating root package version...${colors.reset}`);
    if (!dryRun) {
        const rootSuccess = updatePackageVersion(rootDir, newVersion);
        if (rootSuccess) {
            updateResults.successful.push('Root package');
        } else {
            updateResults.failed.push('Root package');
        }
    } else {
        console.log(`${colors.cyan}   Would update root package to ${newVersion}${colors.reset}`);
    }
    
    // 2. Update services aggregate
    console.log(`\n${colors.bright}2. Updating services aggregate version...${colors.reset}`);
    const servicesDir = path.join(rootDir, 'services');
    if (!dryRun) {
        const servicesSuccess = updatePackageVersion(servicesDir, newVersion);
        if (servicesSuccess) {
            updateResults.successful.push('Services aggregate');
        } else {
            updateResults.failed.push('Services aggregate');
        }
    } else {
        console.log(`${colors.cyan}   Would update services aggregate to ${newVersion}${colors.reset}`);
    }
    
    // 3. Update utilities aggregate
    console.log(`\n${colors.bright}3. Updating utilities aggregate version...${colors.reset}`);
    const utilitiesDir = path.join(rootDir, 'utilities');
    if (!dryRun) {
        const utilitiesSuccess = updatePackageVersion(utilitiesDir, newVersion);
        if (utilitiesSuccess) {
            updateResults.successful.push('Utilities aggregate');
        } else {
            updateResults.failed.push('Utilities aggregate');
        }
    } else {
        console.log(`${colors.cyan}   Would update utilities aggregate to ${newVersion}${colors.reset}`);
    }
    
    // 4. Update individual service packages
    console.log(`\n${colors.bright}4. Updating individual service packages...${colors.reset}`);
    if (fs.existsSync(servicesDir)) {
        const servicePackages = fs.readdirSync(servicesDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory() && dirent.name !== 'node_modules')
            .map(dirent => ({ name: dirent.name, path: path.join(servicesDir, dirent.name) }));
        
        let serviceUpdateCount = 0;
        for (const pkg of servicePackages) {
            if (fs.existsSync(path.join(pkg.path, 'package.json'))) {
                if (!dryRun) {
                    const success = updatePackageVersion(pkg.path, newVersion);
                    if (success) {
                        serviceUpdateCount++;
                    } else {
                        updateResults.failed.push(`Service: ${pkg.name}`);
                    }
                } else {
                    console.log(`${colors.cyan}   Would update ${pkg.name} service to ${newVersion}${colors.reset}`);
                    serviceUpdateCount++;
                }
            }
        }
        
        if (serviceUpdateCount > 0) {
            updateResults.successful.push(`${serviceUpdateCount} service packages`);
        }
    }
    
    // 5. Update individual utility packages
    console.log(`\n${colors.bright}5. Updating individual utility packages...${colors.reset}`);
    if (fs.existsSync(utilitiesDir)) {
        const utilityPackages = fs.readdirSync(utilitiesDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory() && dirent.name !== 'node_modules')
            .map(dirent => ({ name: dirent.name, path: path.join(utilitiesDir, dirent.name) }));
        
        let utilityUpdateCount = 0;
        for (const pkg of utilityPackages) {
            if (fs.existsSync(path.join(pkg.path, 'package.json'))) {
                if (!dryRun) {
                    const success = updatePackageVersion(pkg.path, newVersion);
                    if (success) {
                        utilityUpdateCount++;
                    } else {
                        updateResults.failed.push(`Utility: ${pkg.name}`);
                    }
                } else {
                    console.log(`${colors.cyan}   Would update ${pkg.name} utility to ${newVersion}${colors.reset}`);
                    utilityUpdateCount++;
                }
            }
        }
        
        if (utilityUpdateCount > 0) {
            updateResults.successful.push(`${utilityUpdateCount} utility packages`);
        }
    }
    
    // 6. Update dependency versions in aggregate packages
    console.log(`\n${colors.bright}6. Updating dependency versions in aggregate packages...${colors.reset}`);
    
    // Update services aggregate dependencies
    if (!dryRun) {
        const servicesSuccess = updateAggregateDependencies(servicesDir, newVersion, 'services');
        if (servicesSuccess) {
            updateResults.successful.push('Services aggregate dependencies');
        } else {
            updateResults.failed.push('Services aggregate dependencies');
        }
    } else {
        console.log(`${colors.cyan}   Would update services aggregate dependencies to ^${newVersion}${colors.reset}`);
    }
    
    // Update utilities aggregate dependencies
    if (!dryRun) {
        const utilitiesSuccess = updateAggregateDependencies(utilitiesDir, newVersion, 'utilities');
        if (utilitiesSuccess) {
            updateResults.successful.push('Utilities aggregate dependencies');
        } else {
            updateResults.failed.push('Utilities aggregate dependencies');
        }
    } else {
        console.log(`${colors.cyan}   Would update utilities aggregate dependencies to ^${newVersion}${colors.reset}`);
    }
    
    // 7. Commit and tag (if not dry run and not skipping git)
    if (!dryRun && !skipGit) {
        console.log(`\n${colors.bright}7. Committing changes and creating tag...${colors.reset}`);
        const gitSuccess = commitAndTag(newVersion, skipGit);
        if (gitSuccess) {
            updateResults.successful.push('Git commit and tag');
        } else {
            updateResults.failed.push('Git commit and tag');
        }
    } else if (!dryRun && skipGit) {
        console.log(`\n${colors.yellow}7. Skipping git operations...${colors.reset}`);
    } else {
        console.log(`\n${colors.cyan}7. Would commit changes and create tag v${newVersion}${colors.reset}`);
    }
    
    // Display results
    console.log(`\n${colors.bright}${colors.green}🎉 Version management completed!${colors.reset}`);
    console.log(`\n${colors.bright}📊 Update Results:${colors.reset}`);
    
    if (updateResults.successful.length > 0) {
        console.log(`${colors.green}✅ Successfully updated: ${updateResults.successful.length} items${colors.reset}`);
        updateResults.successful.forEach(item => console.log(`   ${colors.green}- ${item}${colors.reset}`));
    }
    
    if (updateResults.failed.length > 0) {
        console.log(`${colors.red}❌ Failed to update: ${updateResults.failed.length} items${colors.reset}`);
        updateResults.failed.forEach(item => console.log(`   ${colors.red}- ${item}${colors.reset}`));
    }
    
    if (!dryRun) {
        console.log(`\n${colors.bright}${colors.cyan}📋 Next Steps:${colors.reset}`);
        console.log(`${colors.yellow}1.${colors.reset} Review the changes`);
        console.log(`${colors.yellow}2.${colors.reset} Publish packages: ${colors.cyan}npm run publish:all${colors.reset}`);
        console.log(`${colors.yellow}3.${colors.reset} Or push to production branch for automatic publishing`);
        if (!skipGit) {
            console.log(`${colors.yellow}4.${colors.reset} Push tags: ${colors.cyan}git push --tags${colors.reset}`);
        }
    }
    
    // Exit with error code if any updates failed
    if (updateResults.failed.length > 0) {
        process.exit(1);
    }
}

// Show usage information
function showUsage() {
    console.log(`${colors.bright}${colors.cyan}📖 Version Manager${colors.reset}`);
    console.log(`\nThis script manages versions across all packages in the My App Libraries repository.\n`);
    
    console.log(`${colors.bright}Usage:${colors.reset}`);
    console.log(`  node scripts/version-manager.js [type] [options]\n`);
    
    console.log(`${colors.bright}Version Types (default: patch):${colors.reset}`);
    console.log(`  patch    Increment patch version (1.0.0 → 1.0.1) - default`);
    console.log(`  minor    Increment minor version (1.0.0 → 1.1.0)`);
    console.log(`  major    Increment major version (1.0.0 → 2.0.0)\n`);
    
    console.log(`${colors.bright}Options:${colors.reset}`);
    console.log(`  --git       Include git operations (commit and tag)`);
    console.log(`  --dry-run   Show what would be changed without making changes`);
    console.log(`  --help, -h  Show this help message\n`);
    
    console.log(`${colors.bright}Examples:${colors.reset}`);
    console.log(`  ${colors.cyan}npm run version:patch${colors.reset}   # Patch version (1.1.1 → 1.1.2)`);
    console.log(`  ${colors.cyan}npm run version:minor${colors.reset}   # Minor version (1.1.1 → 1.2.0)`);
    console.log(`  ${colors.cyan}npm run version:major${colors.reset}   # Major version (1.1.1 → 2.0.0)`);
}

// Parse command line arguments
const args = process.argv.slice(2);

// Default to patch version with no git operations (for development workflow)
const versionType = args[0] || 'patch';
const options = {
    skipGit: args.includes('--no-git') || !args.includes('--git'),
    dryRun: args.includes('--dry-run')
};

if (args.includes('--help') || args.includes('-h')) {
    showUsage();
    process.exit(0);
}

if (!['patch', 'minor', 'major'].includes(versionType)) {
    console.error(`${colors.red}❌ Invalid version type: ${versionType}${colors.reset}`);
    console.error(`${colors.yellow}Valid types: patch, minor, major${colors.reset}`);
    process.exit(1);
}

// Execute the version management
manageVersions(versionType, options);