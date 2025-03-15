const fs = require('fs');
const path = require('path');

// Function to recursively search for package.json files in node_modules
function findPackageJsonFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      if (file === 'node_modules') {
        // Skip nested node_modules to avoid infinite recursion
        continue;
      }
      findPackageJsonFiles(filePath, fileList);
    } else if (file === 'package.json') {
      fileList.push(filePath);
    }
  }
  
  return fileList;
}

// Function to check React peer dependencies
function checkReactPeerDependencies(packageJsonPath) {
  const content = fs.readFileSync(packageJsonPath, 'utf8');
  const pkg = JSON.parse(content);
  
  if (pkg.peerDependencies && (pkg.peerDependencies.react || pkg.peerDependencies['react-dom'])) {
    console.log(`Package: ${pkg.name}`);
    if (pkg.peerDependencies.react) {
      console.log(`  React peer dependency: ${pkg.peerDependencies.react}`);
    }
    if (pkg.peerDependencies['react-dom']) {
      console.log(`  React DOM peer dependency: ${pkg.peerDependencies['react-dom']}`);
    }
    console.log('');
  }
}

// Main function
function main() {
  const nodeModulesPath = path.join(__dirname, 'node_modules');
  console.log('Checking for React peer dependencies...\n');
  
  if (!fs.existsSync(nodeModulesPath)) {
    console.log('node_modules directory not found. Run npm install first.');
    return;
  }
  
  const packageJsonFiles = findPackageJsonFiles(nodeModulesPath);
  
  for (const file of packageJsonFiles) {
    checkReactPeerDependencies(file);
  }
  
  console.log('Dependency check complete.');
}

main(); 