#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.join(__dirname, '..');

// Function to create a temporary .npmrc file with CodeArtifact authentication
function createTemporaryNpmrc(registryUrl, authToken) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npmrc-'));
    const npmrcPath = path.join(tmpDir, '.npmrc');
    
    // Extract registry host from URL (remove protocol)
    const registryHost = registryUrl.replace(/^https?:\/\//, '');
    
    const npmrcContent = `@myorg:registry=${registryUrl}
//${registryHost}/:_authToken=${authToken}`;
    
    fs.writeFileSync(npmrcPath, npmrcContent, { mode: 0o600 });
    return npmrcPath;
}

// Function to publish a package
function publishPackage(packagePath, packageName, registryUrl, authToken) {
    console.log(`\n📦 Publishing ${packageName}...`);

    // Store current directory to restore later
    const originalDir = process.cwd();
    let npmrcPath = null;

    try {
        // Check if package.json exists
        const packageJsonPath = path.join(packagePath, 'package.json');
        if (!fs.existsSync(packageJsonPath)) {
            console.error(`❌ No package.json found in ${packagePath}`);
            return { success: false, skipped: false };
        }

        // Create temporary .npmrc with CodeArtifact authentication
        npmrcPath = createTemporaryNpmrc(registryUrl, authToken);

        // Change to package directory and publish
        process.chdir(packagePath);
        
        try {
            // Capture output to check for 409 errors
            const output = execSync(`npm publish --userconfig ${npmrcPath}`, { 
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe']
            });
            console.log(output);
            console.log(`✅ Successfully published ${packageName}`);
            return { success: true, skipped: false };
        } catch (publishError) {
            // Check if error is due to version already existing (409 conflict)
            const errorOutput = publishError.stderr ? publishError.stderr.toString() : '';
            const errorMessage = publishError.message || '';
            const stdoutOutput = publishError.stdout ? publishError.stdout.toString() : '';
            const combinedError = errorOutput + errorMessage + stdoutOutput;
            
            if (combinedError.includes('409') || 
                combinedError.includes('E409') || 
                combinedError.includes('already exists') || 
                combinedError.includes('cannot publish over existing version')) {
                console.log(`⏭️  Skipped ${packageName} - version already exists`);
                return { success: true, skipped: true };
            }
            
            // Not a 409 error, show the error and rethrow
            console.error(errorOutput);
            throw publishError;
        }
    } catch (error) {
        console.error(`❌ Failed to publish ${packageName}:`, error.message);
        return { success: false, skipped: false };
    } finally {
        // Always restore original directory
        process.chdir(originalDir);
        
        // Clean up temporary .npmrc
        if (npmrcPath) {
            try {
                const tmpDir = path.dirname(npmrcPath);
                fs.rmSync(tmpDir, { recursive: true, force: true });
            } catch (cleanupError) {
                console.warn(`⚠️  Failed to clean up temporary .npmrc: ${cleanupError.message}`);
            }
        }
    }
}

// Get command line arguments
const args = process.argv.slice(2);
const publishType = args[0] || 'all';
const registryUrl = args[1];
const authToken = args[2];

// Validate required parameters
if (!registryUrl || !authToken) {
    console.error('❌ Error: Registry URL and auth token are required');
    console.error('\nUsage:');
    console.error('  node scripts/publish-packages.js [type] [registryUrl] [authToken]');
    console.error('  - type: all|services|utilities|services-aggregate|utilities-aggregate|main (default: all)');
    console.error('  - registryUrl: CodeArtifact registry URL');
    console.error('  - authToken: CodeArtifact authorization token');
    process.exit(1);
}

console.log(`🚀 Starting package publishing (type: ${publishType})`);
console.log(`📍 Registry: ${registryUrl}`);

// Track publishing results
let publishResults = {
    successful: [],
    failed: [],
    skipped: []
};

// Publish individual service packages only
if (publishType === 'all' || publishType === 'services') {
    console.log('\n📁 Publishing individual service packages...');

    const servicesDir = path.join(rootDir, 'services');
    const servicePackages = fs.readdirSync(servicesDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory() && dirent.name !== 'node_modules')
        .map(dirent => ({ name: dirent.name, path: path.join(servicesDir, dirent.name) }));

    servicePackages.forEach(pkg => {
        const result = publishPackage(pkg.path, `@myorg/${pkg.name}`, registryUrl, authToken);
        if (result.success) {
            if (result.skipped) {
                publishResults.skipped.push(`@myorg/${pkg.name}`);
            } else {
                publishResults.successful.push(`@myorg/${pkg.name}`);
            }
        } else {
            publishResults.failed.push(`@myorg/${pkg.name}`);
        }
    });
}

// Publish services aggregate package (depends on individual service packages)
if (publishType === 'all' || publishType === 'services-aggregate') {
    console.log('\n📁 Publishing services aggregate package...');
    
    const servicesResult = publishPackage(path.join(rootDir, 'services'), '@myorg/services', registryUrl, authToken);
    if (servicesResult.success) {
        if (servicesResult.skipped) {
            publishResults.skipped.push('@myorg/services');
        } else {
            publishResults.successful.push('@myorg/services');
        }
    } else {
        publishResults.failed.push('@myorg/services');
    }
}

// Publish individual utility packages only
if (publishType === 'all' || publishType === 'utilities') {
    console.log('\n📁 Publishing individual utility packages...');

    const utilitiesDir = path.join(rootDir, 'utilities');
    const utilityPackages = fs.readdirSync(utilitiesDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory() && dirent.name !== 'node_modules')
        .map(dirent => ({ name: dirent.name, path: path.join(utilitiesDir, dirent.name) }));

    utilityPackages.forEach(pkg => {
        const result = publishPackage(pkg.path, `@myorg/${pkg.name}`, registryUrl, authToken);
        if (result.success) {
            if (result.skipped) {
                publishResults.skipped.push(`@myorg/${pkg.name}`);
            } else {
                publishResults.successful.push(`@myorg/${pkg.name}`);
            }
        } else {
            publishResults.failed.push(`@myorg/${pkg.name}`);
        }
    });
}

// Publish utilities aggregate package (depends on individual utility packages)
if (publishType === 'all' || publishType === 'utilities-aggregate') {
    console.log('\n📁 Publishing utilities aggregate package...');
    
    const utilitiesResult = publishPackage(path.join(rootDir, 'utilities'), '@myorg/utilities', registryUrl, authToken);
    if (utilitiesResult.success) {
        if (utilitiesResult.skipped) {
            publishResults.skipped.push('@myorg/utilities');
        } else {
            publishResults.successful.push('@myorg/utilities');
        }
    } else {
        publishResults.failed.push('@myorg/utilities');
    }
}

// Publish main package (depends on all other packages)
if (publishType === 'all' || publishType === 'main') {
    console.log('\n📁 Publishing main package...');
    const mainResult = publishPackage(rootDir, '@myorg/libraries', registryUrl, authToken);
    if (mainResult.success) {
        if (mainResult.skipped) {
            publishResults.skipped.push('@myorg/libraries');
        } else {
            publishResults.successful.push('@myorg/libraries');
        }
    } else {
        publishResults.failed.push('@myorg/libraries');
    }
}

// Display results summary
console.log('\n🎉 Publishing process completed!');
console.log('\n📊 Results Summary:');

const totalProcessed = publishResults.successful.length + publishResults.failed.length + publishResults.skipped.length;
console.log(`📦 Total packages processed: ${totalProcessed}`);

console.log(`✅ Successfully published: ${publishResults.successful.length} packages`);
if (publishResults.successful.length > 0) {
    publishResults.successful.forEach(pkg => console.log(`   - ${pkg}`));
}

if (publishResults.skipped.length > 0) {
    console.log(`⏭️  Skipped (already exists): ${publishResults.skipped.length} packages`);
    publishResults.skipped.forEach(pkg => console.log(`   - ${pkg}`));
}

if (publishResults.failed.length > 0) {
    console.log(`❌ Failed to publish: ${publishResults.failed.length} packages`);
    publishResults.failed.forEach(pkg => console.log(`   - ${pkg}`));
}

console.log('\nUsage:');
console.log('  node scripts/publish-packages.js [type] [registryUrl] [authToken]');
console.log('  - type: all|services|utilities|services-aggregate|utilities-aggregate|main (default: all)');
console.log('  - registryUrl: CodeArtifact registry URL');
console.log('  - authToken: CodeArtifact authorization token');
console.log('\nPublish sequence for dependencies:');
console.log('  1. utilities (individual packages)');
console.log('  2. services (individual packages)');
console.log('  3. utilities-aggregate (depends on individual utilities)');
console.log('  4. services-aggregate (depends on individual services)');
console.log('  5. main (depends on all packages)');

// Exit with error code if any packages failed
if (publishResults.failed.length > 0) {
    process.exit(1);
}