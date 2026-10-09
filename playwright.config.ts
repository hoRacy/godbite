import { defineConfig, devices } from '@playwright/test';
const chromiumLaunch={executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-gpu-sandbox']};
export default defineConfig({
  testDir:'./tests',workers:1,timeout:35000,expect:{timeout:8000},
  reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:'http://127.0.0.1:4173/godbite/',trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'npm run preview -- --port 4173',url:'http://127.0.0.1:4173/godbite/',reuseExistingServer:!process.env.CI},
  projects:[
    {name:'chrome',use:{...devices['Desktop Chrome'],launchOptions:chromiumLaunch}},
    {name:'firefox',use:{...devices['Desktop Firefox']}},
    {name:'webkit',use:{...devices['Desktop Safari']}},
    {name:'mobile-chrome',use:{...devices['Pixel 7'],launchOptions:chromiumLaunch}},
  ],
});
