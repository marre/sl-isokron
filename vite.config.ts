import { defineConfig } from 'vite';
// Browser tests use their own synthetic fixtures and never overwrite real app data.
export default defineConfig({ publicDir: process.env.SLISO_TEST_DATA === '1' ? '.data-build/browser-public' : 'public' });
