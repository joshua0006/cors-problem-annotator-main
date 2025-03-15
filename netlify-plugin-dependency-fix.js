// netlify-plugin-dependency-fix.js
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
      await utils.run.command('ls -la node_modules/react-file-viewer');
      await utils.run.command('cat node_modules/react-file-viewer/package.json | grep -i react');
      
      // Force install React and React-DOM to ensure they're the correct versions
      console.log('🔧 Forcing React dependency installation');
      await utils.run.command('npm install react@18.3.1 react-dom@18.3.1 --force');
      console.log('✅ React dependencies forced');
    } catch (error) {
      console.log('❌ Error fixing dependencies:', error);
      utils.build.failBuild('Failed to fix dependencies', { error });
    }
  }
}; 