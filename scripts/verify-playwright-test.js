#!/usr/bin/env node

/**
 * 快速驗證腳本：驗證 Playwright 測試文件的有效性
 * 
 * 運行：node scripts/verify-playwright-test.js
 */

const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function checkFile(filePath, checks) {
  const fullPath = path.join(__dirname, '..', filePath);
  
  if (!fs.existsSync(fullPath)) {
    log(`✗ 文件不存在: ${filePath}`, 'red');
    return false;
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  let allPassed = true;

  for (const [name, pattern] of Object.entries(checks)) {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    const passed = regex.test(content);
    const status = passed ? '✓' : '✗';
    const color = passed ? 'green' : 'red';
    log(`  ${status} ${name}`, color);
    allPassed = allPassed && passed;
  }

  return allPassed;
}

async function verify() {
  log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║        ✅ Playwright 測試文件驗證                          ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝', 'cyan');

  let allOk = true;

  // 1. 檢查 quick-sync-test.spec.ts
  log('\n[1/3] 驗證 e2e/quick-sync-test.spec.ts...', 'yellow');
  const quickTestOk = checkFile('e2e/quick-sync-test.spec.ts', {
    '導入 test, expect, chromium, Page': /import\s*{\s*test\s*,\s*expect\s*,\s*chromium\s*,\s*Page\s*}\s*from\s*['"]@playwright\/test['"];/,
    '定義測試函數': /test\s*\(\s*['"]Classroom Whiteboard Sync/,
    '啟動瀏覽器': /chromium\.launch\s*\(/,
    '創建頁面上下文': /newContext\s*\(\s*\)/,
    '設定視口大小': /setViewportSize\s*\(/,
    '設定網路延遲': /page\.route\s*\(/,
    'goto 頁面': /\.goto\s*\(/,
    '尋找 canvas': /locator\s*\(\s*['"]canvas['"]\s*\)/,
    '滑鼠繪圖': /mouse\.move\s*\(|mouse\.down\s*\(|mouse\.up\s*\(/,
    '評估 canvas 像素': /evaluate\s*\(\s*\(\s*\)\s*=>\s*{/,
    '錯誤處理': /catch\s*\(/,
    '資源清理': /finally\s*{/,
  });
  allOk = allOk && quickTestOk;

  // 2. 檢查 playwright.config.ts
  log('\n[2/3] 驗證 playwright.config.ts...', 'yellow');
  const configOk = checkFile('playwright.config.ts', {
    '導入 defineConfig': /import\s*{\s*defineConfig/,
    '定義 testDir': /testDir\s*:\s*['"]\.\/e2e['"]/,
    '設定 webServer': /webServer\s*:\s*{/,
    '前端 URL': /url\s*:\s*['"]http:\/\/localhost:3000['"]/,
    '啟用截圖': /screenshot\s*:\s*['"]only-on-failure['"]/,
    '啟用錄影': /video\s*:\s*['"]retain-on-failure['"]/,
  });
  allOk = allOk && configOk;

  // 3. 檢查 package.json 依賴
  log('\n[3/3] 驗證 package.json...', 'yellow');
  const packageOk = checkFile('package.json', {
    '安裝 playwright': /"playwright"\s*:/,
    '安裝 @playwright/test': /"@playwright\/test"\s*:/,
    '安裝 agora-rtc-sdk-ng': /"agora-rtc-sdk-ng"\s*:/,
    '安裝 white-web-sdk': /"white-web-sdk"\s*:/,
  });
  allOk = allOk && packageOk;

  // 總結
  log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
  if (allOk) {
    log('║  ✅ 所有驗證通過！可以運行測試                            ║', 'cyan');
    log('╚════════════════════════════════════════════════════════════╝', 'cyan');

    log('\n📝 快速開始：', 'cyan');
    log('  1. 運行測試:', 'gray');
    log('     npx playwright test e2e/quick-sync-test.spec.ts --headed', 'yellow');
    log('  2. 或使用快速腳本:', 'gray');
    log('     .\\scripts\\test-classroom-delay.ps1', 'yellow');
  } else {
    log('║  ❌ 某些驗證失敗，請檢查上述項目                          ║', 'cyan');
    log('╚════════════════════════════════════════════════════════════╝', 'cyan');
    process.exit(1);
  }
}

verify().catch(console.error);
