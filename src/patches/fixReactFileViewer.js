/**
 * Direct patcher for react-file-viewer
 * This script directly modifies the package.json of react-file-viewer
 * to accept React 18 as a peer dependency.
 */

// Use dynamic imports for compatibility with both ESM and CommonJS
(async () => {
  try {
    // Import modules dynamically
    const fs = await import('fs').then(m => m.default || m);
    const path = await import('path').then(m => m.default || m);
    const { fileURLToPath } = await import('url').then(m => m.default || m);
    
    console.log('Starting direct patching of react-file-viewer...');
    
    // Get current directory in ESM-compatible way
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    const packagePath = path.resolve(
      __dirname, 
      '../../node_modules/react-file-viewer/package.json'
    );
    
    console.log(`Looking for package at: ${packagePath}`);
    
    if (fs.existsSync(packagePath)) {
      console.log('Found package.json, reading content...');
      
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      
      console.log('Current peerDependencies:', JSON.stringify(packageJson.peerDependencies, null, 2));
      
      // Modify the peerDependencies
      if (packageJson.peerDependencies) {
        packageJson.peerDependencies.react = "^16.3.0 || ^17.0.0 || ^18.0.0";
        packageJson.peerDependencies["react-dom"] = "^16.3.0 || ^17.0.0 || ^18.0.0";
        
        console.log('Modified peerDependencies:', JSON.stringify(packageJson.peerDependencies, null, 2));
        
        // Write the modified file back
        fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
        
        console.log('Successfully patched react-file-viewer!');
      } else {
        console.error('No peerDependencies found in package.json');
      }
    } else {
      console.error('Package.json not found at expected location');
      
      // List the directory to help diagnose the issue
      const nodeModulesDir = path.resolve(__dirname, '../../node_modules');
      if (fs.existsSync(nodeModulesDir)) {
        console.log('node_modules directory exists, listing content...');
        const dirs = fs.readdirSync(nodeModulesDir);
        console.log('node_modules contents:', dirs.join(', '));
        
        const reactFileViewerDir = path.resolve(nodeModulesDir, 'react-file-viewer');
        if (fs.existsSync(reactFileViewerDir)) {
          console.log('react-file-viewer directory exists, listing content...');
          const files = fs.readdirSync(reactFileViewerDir);
          console.log('react-file-viewer contents:', files.join(', '));
        } else {
          console.error('react-file-viewer directory does not exist in node_modules');
        }
      } else {
        console.error('node_modules directory does not exist');
      }
    }
  } catch (error) {
    console.error('Error patching react-file-viewer:', error);
  }
})(); 