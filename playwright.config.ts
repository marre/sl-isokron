import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'./tests/browser', timeout:30000, fullyParallel:false,
 use:{baseURL:'http://127.0.0.1:5174', headless:true, launchOptions:{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']},trace:'retain-on-failure'},
 webServer:{command:'SLISO_TEST_DATA=1 npm run dev -- --port 5174',url:'http://127.0.0.1:5174',reuseExistingServer:!process.env.CI},
 projects:[{name:'desktop',use:{viewport:{width:1440,height:1000}}},{name:'mobile',use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true}}],
});
