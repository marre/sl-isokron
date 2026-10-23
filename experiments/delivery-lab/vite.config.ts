import {defineConfig} from 'vite';
export default defineConfig({publicDir:false,build:{minify:false,sourcemap:true,outDir:'.data-build/delivery-lab/site',rollupOptions:{input:'experiments/delivery-lab/index.html'}}});
