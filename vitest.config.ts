import { defineConfig } from 'vitest/config';
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
      '@ui/': path.resolve(__dirname, './registry/data-table/components/ui/'),
    },
    extensions: ['.ts', '.tsx', '.d.ts', '.js', '.jsx'],
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./vitest.setup.tsx'],
    include: ['registry/data-table/components/**/*.test.{ts,tsx}'],
  },
});