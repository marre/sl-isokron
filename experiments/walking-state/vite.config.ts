import {defineConfig} from 'vite';
export default defineConfig({publicDir:false,build:{outDir:'.data-build/walking-state/site',minify:false,sourcemap:true,rollupOptions:{input:'experiments/walking-state/index.html'}}});
