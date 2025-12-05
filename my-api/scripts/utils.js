import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Discover all Lambda modules in the repository
 * Excludes the game folder as specified in requirements
 * @returns {Array} Array of module objects with name and path
 */
function discoverModules() {
    const rootDir = process.cwd();
    const modules = [];
    
    try {
        const entries = fs.readdirSync(rootDir, { withFileTypes: true });
        
        for (const entry of entries) {
            // Skip if not a directory or if it's the game folder
            if (!entry.isDirectory() || entry.name === 'game') {
                continue;
            }
            
            const modulePath = path.join(rootDir, entry.name);
            const packageJsonPath = path.join(modulePath, 'package.json');
            const serverlessYmlPath = path.join(modulePath, 'serverless.yml');
            
            // Check if both package.json and serverless.yml exist
            if (fs.existsSync(packageJsonPath) && fs.existsSync(serverlessYmlPath)) {
                modules.push({
                    name: entry.name,
                    path: modulePath,
                    hasEnvFile: fs.existsSync(path.join(modulePath, '.env'))
                });
            }
        }
        
        // Sort modules alphabetically for consistency
        modules.sort((a, b) => a.name.localeCompare(b.name));
        
        logWithColor(`Discovered ${modules.length} Lambda modules: ${modules.map(m => m.name).join(', ')}`, 'green');
        return modules;
        
    } catch (error) {
        logWithColor(`Error discovering modules: ${error.message}`, 'red');
        return [];
    }
}

/**
 * Execute a shell command with proper error handling
 * @param {string} command - The command to execute
 * @param {string} cwd - Working directory for the command
 * @param {boolean} silent - Whether to suppress output
 * @returns {Object} Result object with success, output, and error
 */
function executeCommand(command, cwd = process.cwd(), silent = false) {
    try {
        const output = execSync(command, {
            cwd: cwd,
            encoding: 'utf8',
            stdio: silent ? 'pipe' : 'inherit'
        });
        
        return {
            success: true,
            output: output,
            error: null
        };
    } catch (error) {
        return {
            success: false,
            output: null,
            error: error.message
        };
    }
}

/**
 * Log messages with color formatting
 * @param {string} message - The message to log
 * @param {string} color - Color name (red, green, yellow, blue, cyan, magenta)
 */
function logWithColor(message, color = 'white') {
    const colors = {
        red: '\x1b[31m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        magenta: '\x1b[35m',
        cyan: '\x1b[36m',
        white: '\x1b[37m',
        reset: '\x1b[0m'
    };
    
    const colorCode = colors[color] || colors.white;
    console.log(`${colorCode}${message}${colors.reset}`);
}

/**
 * Validate required environment variables
 * @param {Array} requiredVars - Array of required environment variable names
 * @returns {Object} Validation result with success status and missing variables
 */
function validateEnvironment(requiredVars = []) {
    const missing = [];
    
    for (const varName of requiredVars) {
        if (!process.env[varName]) {
            missing.push(varName);
        }
    }
    
    const isValid = missing.length === 0;
    
    if (!isValid) {
        logWithColor(`Missing required environment variables: ${missing.join(', ')}`, 'red');
    } else {
        logWithColor('All required environment variables are set', 'green');
    }
    
    return {
        success: isValid,
        missing: missing
    };
}

export {
    discoverModules,
    executeCommand,
    logWithColor,
    validateEnvironment
};