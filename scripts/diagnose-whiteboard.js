#!/usr/bin/env node

/**
 * 快速診斷工具：檢查白板同步環境
 * 
 * 運行：node scripts/diagnose-whiteboard.js
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

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

function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, { timeout: 2000 }, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function checkApi(endpoint) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:3000${endpoint}`, { timeout: 5000 }, (res) => {
      resolve(res.statusCode < 500);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function runDiagnostics() {
  log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║        🔍 白板同步環境診斷工具                            ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝', 'cyan');

  // 1. 檢查前端
  log('\n[1/6] 檢查前端伺服器 (port 3000)...', 'yellow');
  const frontendUp = await checkPort(3000);
  if (frontendUp) {
    log('  ✓ 前端伺服器運行中', 'green');
  } else {
    log('  ✗ 前端伺服器未運行', 'red');
    log('  💡 請運行: npm run dev', 'gray');
    return;
  }

  // 2. 檢查 API 端點
  log('\n[2/6] 檢查 API 端點...', 'yellow');
  const apiEndpoints = [
    '/api/whiteboard/stream',
    '/api/whiteboard/event',
    '/api/whiteboard/state',
    '/api/classroom/stream',
    '/api/classroom/session',
  ];

  let apiOk = true;
  for (const endpoint of apiEndpoints) {
    const ok = await checkApi(endpoint);
    const status = ok ? '✓' : '✗';
    const color = ok ? 'green' : 'red';
    log(`  ${status} ${endpoint}`, color);
    apiOk = apiOk && ok;
  }

  // 3. 檢查依賴
  log('\n[3/6] 檢查 NPM 依賴...', 'yellow');
  const requiredPackages = [
    'playwright',
    '@playwright/test',
    'agora-rtc-sdk-ng',
    'white-web-sdk',
  ];

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')
  );

  let depsOk = true;
  for (const pkg of requiredPackages) {
    const installed =
      packageJson.dependencies?.[pkg] ||
      packageJson.devDependencies?.[pkg];
    const status = installed ? '✓' : '✗';
    const color = installed ? 'green' : 'red';
    log(`  ${status} ${pkg} (${installed || 'NOT FOUND'})`, color);
    depsOk = depsOk && !!installed;
  }

  // 4. 檢查測試文件
  log('\n[4/6] 檢查測試文件...', 'yellow');
  const testFiles = [
    'e2e/classroom-delay-sync.spec.ts',
    'playwright.config.ts',
  ];

  let testOk = true;
  for (const file of testFiles) {
    const exists = fs.existsSync(path.join(__dirname, '../', file));
    const status = exists ? '✓' : '✗';
    const color = exists ? 'green' : 'red';
    log(`  ${status} ${file}`, color);
    testOk = testOk && exists;
  }

  // 5. 檢查環境變數
  log('\n[5/6] 檢查環境設定...', 'yellow');
  const envFile = path.join(__dirname, '../.env.local');
  const envExists = fs.existsSync(envFile);
  if (envExists) {
    log('  ✓ .env.local 已配置', 'green');
  } else {
    log('  ⚠ .env.local 未找到 (可選)', 'yellow');
  }

  // 6. 測試 Playwright
  log('\n[6/6] 檢查 Playwright 可用性...', 'yellow');
  try {
    const { chromium } = require('playwright');
    log('  ✓ Playwright 可用', 'green');
  } catch (e) {
    log(`  ✗ Playwright 不可用: ${e.message}`, 'red');
  }

  // 總結
  log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
  if (frontendUp && apiOk && depsOk && testOk) {
    log('║  ✅ 環境檢查通過！可以開始測試                            ║', 'cyan');
    log('╚════════════════════════════════════════════════════════════╝', 'cyan');

    log('\n📝 快速開始:', 'cyan');
    log('  1. 開啟新終端，運行前端:', 'gray');
    log('     npm run dev', 'yellow');
    log('  2. 在另一個終端運行測試:', 'gray');
    log('     npx playwright test e2e/classroom-delay-sync.spec.ts --headed', 'yellow');
    log('  3. 或使用快速腳本:', 'gray');
    log('     .\\scripts\\test-classroom-delay.ps1', 'yellow');
  } else {
    log('║  ❌ 環境檢查失敗，請修復以下問題                          ║', 'cyan');
    log('╚════════════════════════════════════════════════════════════╝', 'cyan');

    log('\n⚙️  修復步驟:', 'cyan');
    if (!frontendUp) {
      log('  1. 啟動前端: npm run dev', 'yellow');
    }
    if (!depsOk) {
      log('  2. 安裝依賴: npm install', 'yellow');
    }
    if (!testOk) {
      log('  3. 創建測試文件（已自動建立）', 'yellow');
    }
  }

  log('\n📚 文檔:', 'cyan');
  log('  • Playwright 文檔: https://playwright.dev/docs/intro', 'gray');
  log('  • 專案白板文檔: WHITEBOARD_ACK_TIMEOUT_FIX.md', 'gray');
  log('  • 測試文件位置: e2e/classroom-delay-sync.spec.ts', 'gray');
}

runDiagnostics().catch(console.error);
