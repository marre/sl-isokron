import {defineConfig} from 'vite';
export default defineConfig({publicDir:false,build:{outDir:'.data-build/production-bundles/site',rollupOptions:{input:'experiments/delivery-lab/production.html'}}});
