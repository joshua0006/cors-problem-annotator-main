import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ["lucide-react"],
    include: ['react', 'react-dom'],
    esbuildOptions: {
      define: {
        global: 'globalThis'
      }
    }
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
      include: [/firebase/, /node_modules/]
    },
    rollupOptions: {
      input: {
        main: './index.html',
      },
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          vendor: ['framer-motion', 'date-fns']
        }
      }
    }
  },
  resolve: {
    alias: {
      'react': path.resolve('./node_modules/react'),
      'react-dom': path.resolve('./node_modules/react-dom'),
      'firebase/app': path.resolve('./node_modules/firebase/app/dist/index.esm.js'),
      'firebase/firestore': path.resolve('./node_modules/firebase/firestore/dist/index.esm.js'),
      'firebase/auth': path.resolve('./node_modules/firebase/auth/dist/index.esm.js'),
      'firebase/storage': path.resolve('./node_modules/firebase/storage/dist/index.esm.js')
    }
  }
});
