const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));
  
  const fileUrl = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');
  console.log('Navigating to', fileUrl);
  await page.goto(fileUrl);
  
  console.log('Clicking btn-request-graph...');
  await page.click('#btn-request-graph');
  
  console.log('Waiting 3 seconds for generation...');
  await page.waitForTimeout(3000);
  
  await browser.close();
})();
