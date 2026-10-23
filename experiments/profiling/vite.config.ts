import {defineConfig} from 'vite';
export default defineConfig({publicDir:false,build:{minify:false,sourcemap:true,outDir:'.data-build/profile-site',emptyOutDir:true,rollupOptions:{input:'experiments/profiling/index.html'}}});
