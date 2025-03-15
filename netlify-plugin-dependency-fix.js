// netlify-plugin-dependency-fix.js
const fs = require('fs');
const path = require('path');

module.exports = {
  onPreBuild: async ({ utils, inputs }) => {
    console.log('⚙️ Running dependency fix plugin');
    
    // Force install with legacy peer deps
    try {
      console.log('🔧 Reinstalling dependencies with --legacy-peer-deps');
      await utils.run.command('npm install --legacy-peer-deps');
      console.log('✅ Dependencies reinstalled');
      
      // Try to identify react-file-viewer dependency issues
      console.log('🔍 Checking react-file-viewer dependencies');
      await utils.run.command('ls -la node_modules/react-file-viewer || echo "react-file-viewer not found"');
      
      try {
        const reactFileViewerPkg = path.join(process.cwd(), 'node_modules/react-file-viewer/package.json');
        
        if (fs.existsSync(reactFileViewerPkg)) {
          console.log('📄 Found react-file-viewer package.json');
          
          // Read the package.json content
          const pkgContent = fs.readFileSync(reactFileViewerPkg, 'utf8');
          const pkg = JSON.parse(pkgContent);
          
          console.log('📋 Current peer dependencies:', JSON.stringify(pkg.peerDependencies, null, 2));
          
          // Manually update the peerDependencies
          if (pkg.peerDependencies) {
            pkg.peerDependencies.react = "^16.3.0 || ^17.0.0 || ^18.0.0";
            pkg.peerDependencies["react-dom"] = "^16.3.0 || ^17.0.0 || ^18.0.0";
            
            console.log('✏️ Updated peer dependencies:', JSON.stringify(pkg.peerDependencies, null, 2));
            
            // Write the updated package.json
            fs.writeFileSync(reactFileViewerPkg, JSON.stringify(pkg, null, 2));
            console.log('💾 Saved modified package.json for react-file-viewer');
          }
        } else {
          console.log('⚠️ react-file-viewer package.json not found');
        }
      } catch (err) {
        console.log('⚠️ Error modifying react-file-viewer:', err.message);
      }
      
      // Run the patch-package command explicitly
      console.log('🩹 Running patch-package manually');
      await utils.run.command('npx patch-package --error-on-fail');
      
      // Force install React and React-DOM to ensure they're the correct versions
      console.log('🔧 Forcing React dependency installation');
      await utils.run.command('npm install react@18.3.1 react-dom@18.3.1 --force');
      console.log('✅ React dependencies forced');
    } catch (error) {
      console.log('❌ Error fixing dependencies:', error);
      // Don't fail the build, try to continue
      console.log('⚠️ Continuing despite errors...');
    }
  }
}; 