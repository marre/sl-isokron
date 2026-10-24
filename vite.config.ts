import { defineConfig } from 'vite';
// Browser fixtures never overwrite real app data or depend on external map servers.
export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  define: process.env.SLISO_TEST_DATA === '1'
    ? { 'import.meta.env.VITE_MAP_STYLE_URL': JSON.stringify('none') }
    : {},
  publicDir: process.env.SLISO_TEST_DATA === '1' ? '.data-build/browser-public' : 'public',
});
