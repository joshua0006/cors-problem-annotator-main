#!/usr/bin/env node

/**
 * Build preprocessor script
 * This script runs before the build to prepare the environment,
 * specifically focusing on resolving issues with react-file-viewer
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Starting build preprocessor');

// Function to execute a command and handle errors
function runCommand(command) {
  try {
    console.log(`📌 Running: ${command}`);
    const output = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
    console.log(`✅ Command succeeded`);
    return output;
  } catch (error) {
    console.error(`❌ Command failed: ${error.message}`);
    console.log(`📝 Output: ${error.stdout || ''}`);
    return null;
  }
}

// Ensure patches directory exists
const patchesDir = path.join(__dirname, 'patches');
if (!fs.existsSync(patchesDir)) {
  console.log('🔧 Creating patches directory');
  fs.mkdirSync(patchesDir, { recursive: true });
}

// Check/create the react-file-viewer patch file
const patchFilePath = path.join(patchesDir, 'react-file-viewer+1.2.1.patch');
if (!fs.existsSync(patchFilePath)) {
  console.log('🔧 Creating patch file for react-file-viewer');
  const patchContent = `diff --git a/node_modules/react-file-viewer/package.json b/node_modules/react-file-viewer/package.json
index 90f4bf1..f9f3bdb 100644
--- a/node_modules/react-file-viewer/package.json
+++ b/node_modules/react-file-viewer/package.json
@@ -28,8 +28,8 @@
     "react-data-grid": "2.0.60"
   },
   "peerDependencies": {
-    "react": "^16.3.0",
-    "react-dom": "^16.3.0"
+    "react": "^16.3.0 || ^17.0.0 || ^18.0.0",
+    "react-dom": "^16.3.0 || ^17.0.0 || ^18.0.0"
   },
   "devDependencies": {
     "autoprefixer": "^7.1.0",
`;
  fs.writeFileSync(patchFilePath, patchContent);
  console.log(`✅ Created patch file: ${patchFilePath}`);
}

// Clean node_modules if it exists
const nodeModulesPath = path.join(__dirname, 'node_modules');
if (fs.existsSync(nodeModulesPath)) {
  console.log('🧹 Cleaning node_modules directory');
  try {
    // On Windows, we need to use a different approach
    if (process.platform === 'win32') {
      runCommand('rmdir /s /q node_modules');
    } else {
      runCommand('rm -rf node_modules');
    }
    console.log('✅ Cleaned node_modules directory');
  } catch (error) {
    console.error(`❌ Failed to clean node_modules: ${error.message}`);
  }
}

// Clear npm cache
console.log('🧹 Clearing npm cache');
runCommand('npm cache clean --force');

// Install dependencies with legacy peer deps
console.log('📦 Installing dependencies');
runCommand('npm install --legacy-peer-deps --force');

// Check if react-file-viewer exists and patch it directly
const reactFileViewerPkgPath = path.join(__dirname, 'node_modules/react-file-viewer/package.json');
if (fs.existsSync(reactFileViewerPkgPath)) {
  console.log('🔍 Found react-file-viewer package.json');
  try {
    const pkgContent = fs.readFileSync(reactFileViewerPkgPath, 'utf8');
    const pkg = JSON.parse(pkgContent);

    console.log('📋 Current peer dependencies:', JSON.stringify(pkg.peerDependencies, null, 2));

    // Manually update the peerDependencies
    if (pkg.peerDependencies) {
      pkg.peerDependencies.react = "^16.3.0 || ^17.0.0 || ^18.0.0";
      pkg.peerDependencies["react-dom"] = "^16.3.0 || ^17.0.0 || ^18.0.0";

      console.log('✏️ Updated peer dependencies:', JSON.stringify(pkg.peerDependencies, null, 2));

      // Write the updated package.json
      fs.writeFileSync(reactFileViewerPkgPath, JSON.stringify(pkg, null, 2));
      console.log('💾 Saved modified package.json for react-file-viewer');
    }
  } catch (err) {
    console.error(`❌ Error modifying react-file-viewer: ${err.message}`);
  }
} else {
  console.log('⚠️ react-file-viewer package.json not found after installation');
}

// Try to run patch-package
console.log('🩹 Running patch-package');
runCommand('npx patch-package --error-on-fail');

// Force install React and React-DOM
console.log('🔧 Forcing React dependency installation');
runCommand('npm install react@18.3.1 react-dom@18.3.1 --force');

console.log('✨ Build preprocessor completed'); 