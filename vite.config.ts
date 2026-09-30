import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './registry/data-table/components'),
      '@ui': path.resolve(__dirname, './registry/data-table/components/ui'),
    },
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'registry/data-table/components/data-table/index.ts'),
      name: 'DataTable',
      fileName: 'data-table',
    },
    rollupOptions: {
      external: ['react', 'react-dom', '@inertiajs/react', '@tanstack/react-table'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          '@inertiajs/react': 'InertiaReact',
          '@tanstack/react-table': 'TanStackReactTable',
        },
      },
    },
  },
});