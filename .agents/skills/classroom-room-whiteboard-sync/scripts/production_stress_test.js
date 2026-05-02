#!/usr/bin/env node

/**
 * Production Stress Test Script for Classroom Whiteboard Sync
 * ============================================================
 *
 * 用途：針對正式環境 (https://www.jvtutorcorner.com) 進行壓力測試
 * 測試場景：多組並發教師-學生進入教室並同步白板繪圖
 *
 * 使用方式：
 *   # 基礎壓力測試（3 組並發）
 *   node .agents/skills/classroom-room-whiteboard-sync/scripts/production_stress_test.js
 *
 *   # 自定義並發組數
 *   STRESS_GROUP_COUNT=5 node .agents/skills/classroom-room-whiteboard-sync/scripts/production_stress_test.js
 *
 *   # 運行多次壓力測試迴圈
 *   STRESS_RUNS=5 node .agents/skills/classroom-room-whiteboard-sync/scripts/production_stress_test.js
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../../');

// ─────────────────────────────────────────────────────────────────────
// Load Environment Configuration
// ─────────────────────────────────────────────────────────────────────

console.log('\n📋 Loading Production Environment Configuration...\n');

// Priority: .env.production > .env.local > defaults
const envPath = path.resolve(projectRoot, '.env.production');
const envLocalPath = path.resolve(projectRoot, '.env.local');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log(`✅ Loaded .env.production from ${envPath}`);
} else if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
  console.log(`⚠️  .env.production not found, using .env.local`);
} else {
  console.warn(`⚠️  No .env files found, using defaults`);
}

// ─────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────

const config = {
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
  stressGroupCount: parseInt(process.env.STRESS_GROUP_COUNT || '3'),
  stressRuns: parseInt(process.env.STRESS_RUNS || '1'),
  groupSetupDelay: parseInt(process.env.GROUP_SETUP_DELAY || '2000'),
  logLevel: process.env.STRESS_TEST_LOG_LEVEL || 'info',
  headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
};

// ─────────────────────────────────────────────────────────────────────
// Logging Utilities
// ─────────────────────────────────────────────────────────────────────

const logger = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  warn: (msg) => console.warn(`⚠️  ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  debug: (msg) => {
    if (config.logLevel === 'verbose') {
      console.log(`🐛 ${msg}`);
    }
  },
  banner: (msg) => {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`  ${msg}`);
    console.log(`${'─'.repeat(70)}\n`);
  },
};

// ─────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────

function formatTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.Z]/g, '-');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPlaywrightTest(groupCount) {
  logger.info(`Starting Playwright stress test with ${groupCount} concurrent groups...`);

  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      STRESS_GROUP_COUNT: String(groupCount),
      NEXT_PUBLIC_BASE_URL: config.baseUrl,
    };

    const args = [
      'npx',
      'playwright',
      'test',
      'e2e/classroom_room_whiteboard_sync.spec.ts',
      '-g',
      'Stress test',
      '--project=chromium',
      '--reporter=list',
    ];

    logger.debug(`Command: ${args.join(' ')}`);
    logger.debug(`Environment: STRESS_GROUP_COUNT=${groupCount}, BASE_URL=${config.baseUrl}`);

    const testProcess = spawn('npx', args.slice(1), {
      cwd: projectRoot,
      env,
      stdio: 'inherit',
    });

    testProcess.on('close', (code) => {
      if (code === 0) {
        logger.success(`Playwright test completed successfully (exit code: ${code})`);
        resolve(true);
      } else {
        logger.error(`Playwright test failed with exit code: ${code}`);
        reject(new Error(`Test failed with exit code ${code}`));
      }
    });

    testProcess.on('error', (err) => {
      logger.error(`Failed to spawn test process: ${err.message}`);
      reject(err);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────
// Main Test Runner
// ─────────────────────────────────────────────────────────────────────

async function main() {
  logger.banner('🚀 Production Stress Test for Classroom Whiteboard Sync');

  console.log('Configuration:');
  console.log(`  Base URL: ${config.baseUrl}`);
  console.log(`  Concurrent Groups: ${config.stressGroupCount}`);
  console.log(`  Test Runs: ${config.stressRuns}`);
  console.log(`  Group Setup Delay: ${config.groupSetupDelay}ms`);
  console.log(`  Log Level: ${config.logLevel}\n`);

  // Verify base URL is production
  if (!config.baseUrl.includes('jvtutorcorner.com')) {
    logger.warn(`Base URL does not appear to be production: ${config.baseUrl}`);
    logger.warn(`Proceeding with caution...`);
  } else {
    logger.success(`Using production URL: ${config.baseUrl}`);
  }

  const startTime = Date.now();
  let successCount = 0;
  let failureCount = 0;

  for (let run = 1; run <= config.stressRuns; run++) {
    logger.banner(`📊 Test Run ${run}/${config.stressRuns}`);

    try {
      await runPlaywrightTest(config.stressGroupCount);
      successCount++;
      logger.success(`Run ${run} completed successfully`);

      if (run < config.stressRuns) {
        logger.info(`Waiting ${config.groupSetupDelay}ms before next run...`);
        await delay(config.groupSetupDelay);
      }
    } catch (error) {
      failureCount++;
      logger.error(`Run ${run} failed: ${error.message}`);

      if (config.stressRuns > 1) {
        logger.warn(`Continuing with next run...`);
        await delay(config.groupSetupDelay);
      } else {
        throw error;
      }
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  logger.banner('📈 Test Summary');
  console.log(`Total Runs: ${config.stressRuns}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${failureCount}`);
  console.log(`Total Duration: ${duration}s`);
  console.log(`Average per Run: ${(duration / config.stressRuns).toFixed(2)}s\n`);

  if (failureCount > 0) {
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Execution
// ─────────────────────────────────────────────────────────────────────

main().catch((error) => {
  logger.error(`Fatal error: ${error.message}`);
  logger.debug(error.stack);
  process.exit(1);
});
