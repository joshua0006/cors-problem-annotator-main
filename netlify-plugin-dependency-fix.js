// netlify-plugin-dependency-fix.js
const fs = require('fs');
const path = require('path');

module.exports = {
  onPreBuild: async ({ utils, inputs }) => {
    console.log('⚙️ Running dependency fix plugin');
    console.log('📍 Current working directory:', process.cwd());
    
    // Check if patches directory exists
    const patchesDir = path.join(process.cwd(), 'patches');
    console.log(`🔍 Checking if patches directory exists at ${patchesDir}`);
    if (fs.existsSync(patchesDir)) {
      console.log('✅ Patches directory found');
      // List contents of patches directory
      const patchFiles = fs.readdirSync(patchesDir);
      console.log('📑 Patch files found:', patchFiles.join(', '));
    } else {
      console.log('⚠️ Patches directory not found');
    }
    
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
          // Check node_modules exists
          const nodeModulesDir = path.join(process.cwd(), 'node_modules');
          if (fs.existsSync(nodeModulesDir)) {
            console.log('✅ node_modules directory exists');
          } else {
            console.log('❌ node_modules directory does not exist');
          }
        }
      } catch (err) {
        console.log('⚠️ Error modifying react-file-viewer:', err.message);
        console.log('📑 Error stack:', err.stack);
      }
      
      // Check if patch file exists at the expected location
      const patchFilePath = path.join(process.cwd(), 'patches/react-file-viewer+1.2.1.patch');
      if (fs.existsSync(patchFilePath)) {
        console.log('✅ Patch file found at:', patchFilePath);
        console.log('📄 Patch file contents:');
        console.log(fs.readFileSync(patchFilePath, 'utf8'));
      } else {
        console.log('❌ Patch file not found at:', patchFilePath);
      }
      
      // Run the patch-package command explicitly with verbose logging
      console.log('🩹 Running patch-package manually');
      try {
        await utils.run.command('npx patch-package --error-on-fail --verbose');
      } catch (patchError) {
        console.log('⚠️ Error running patch-package:', patchError.message);
        console.log('🛠️ Applying patch manually...');
        
        // Try applying the patch manually using the patch command if available
        try {
          await utils.run.command('patch -p0 < patches/react-file-viewer+1.2.1.patch || echo "patch command failed"');
        } catch (manualPatchError) {
          console.log('⚠️ Manual patching also failed:', manualPatchError.message);
        }
      }
      
      // Try direct fix script
      console.log('🔄 Running direct fix script');
      try {
        if (fs.existsSync(path.join(process.cwd(), 'src/patches/fixReactFileViewerCjs.cjs'))) {
          await utils.run.command('node src/patches/fixReactFileViewerCjs.cjs');
        } else {
          console.log('❌ Direct fix script not found');
        }
      } catch (fixError) {
        console.log('⚠️ Error running fix script:', fixError.message);
      }
      
      // Force install React and React-DOM to ensure they're the correct versions
      console.log('🔧 Forcing React dependency installation');
      await utils.run.command('npm install react@18.3.1 react-dom@18.3.1 --force');
      console.log('✅ React dependencies forced');
    } catch (error) {
      console.log('❌ Error fixing dependencies:', error);
      console.log('📑 Error stack:', error.stack);
      // Don't fail the build, try to continue
      console.log('⚠️ Continuing despite errors...');
    }
  }
}; 