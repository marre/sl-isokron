import {defineConfig} from 'vite';
export default defineConfig({publicDir:false,build:{outDir:'.data-build/precompute/site',rollupOptions:{input:'experiments/walking-state/integration.html'}}});
