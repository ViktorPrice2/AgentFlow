import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  main: {
    entry: 'app/main/index.ts',
    plugins: [externalizeDepsPlugin()],
    vite: {
      build: {
        outDir: 'dist/main'
      }
    }
  },
  preload: {
    input: {
      index: 'app/preload/index.ts'
    },
    plugins: [externalizeDepsPlugin()],
    vite: {
      build: {
        outDir: 'dist/preload'
      }
    }
  },
  renderer: {
    root: 'app/ui',
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve('app/ui')
      }
    },
    build: {
      outDir: '../../dist/renderer'
    }
  }
});
