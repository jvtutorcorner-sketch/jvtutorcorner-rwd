#!/usr/bin/env node
/**
 * Client Bundle 機密外洩檢查
 * ===========================
 *
 * `next.config.ts` 的 `env:` 區塊會在 build 時把值「行內展開」。
 * 只要有人在 client component 寫下 `process.env.AGORA_APP_CERTIFICATE`，
 * 該機密就會被打包進瀏覽器可讀的 JS——這是靜默發生的，不會有任何警告。
 *
 * 本腳本在 build 後掃描 `.next/static`（唯一會送到瀏覽器的目錄），
 * 比對實際的機密「值」是否出現在其中。
 *
 * 用法：
 *   npm run build && npm run check:bundle-secrets
 *
 * 退出碼：0 = 乾淨；1 = 發現外洩或無法檢查。
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const STATIC_DIR = join(process.cwd(), '.next', 'static');

/** 這些環境變數的「值」絕對不該出現在 client bundle 中。 */
const SECRET_ENV_KEYS = [
  'SESSION_SECRET',
  'API_HMAC_SECRET',
  'LOGIN_BYPASS_SECRET',
  'QA_CAPTCHA_BYPASS',
  'AGORA_APP_CERTIFICATE',
  'AGORA_WHITEBOARD_SK',
  'AGORA_WHITEBOARD_AK',
  'NETLESS_SDK_TOKEN',
  'AWS_SECRET_ACCESS_KEY',
  'CI_AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'STRIPE_SECRET_KEY',
  'PAYPAL_CLIENT_SECRET',
  'LINEPAY_CHANNEL_SECRET',
  'ECPAY_HASH_KEY',
  'ECPAY_HASH_IV',
];

/** 不需依賴環境變數、單看字面就該擋下的樣式。 */
const LITERAL_PATTERNS = [
  { name: 'AWS Access Key ID', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Stripe live secret key', re: /\bsk_live_[0-9a-zA-Z]{16,}/ },
  { name: 'Stripe test secret key', re: /\bsk_test_[0-9a-zA-Z]{16,}/ },
  { name: '已作廢的 session secret', re: /jv_session_secret_change_in_production_2024/ },
  { name: '已作廢的 HMAC secret', re: /jv_hmac_secret_change_in_production_2024/ },
];

/** 太短或太常見的值會誤報，略過。 */
const MIN_SECRET_LENGTH = 12;

function collectFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectFiles(full));
    } else if (/\.(js|mjs|css|json|map)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function main() {
  if (!existsSync(STATIC_DIR)) {
    console.error(`❌ 找不到 ${STATIC_DIR}。請先執行 \`npm run build\`。`);
    process.exit(1);
  }

  const activeSecrets = SECRET_ENV_KEYS
    .map((key) => ({ key, value: process.env[key] }))
    .filter(({ value }) => typeof value === 'string' && value.length >= MIN_SECRET_LENGTH);

  const skipped = SECRET_ENV_KEYS.filter(
    (key) => !activeSecrets.some((s) => s.key === key)
  );

  const files = collectFiles(STATIC_DIR);
  const findings = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const rel = relative(process.cwd(), file);

    for (const { key, value } of activeSecrets) {
      if (content.includes(value)) {
        findings.push({ file: rel, what: `${key} 的實際值` });
      }
    }
    for (const { name, re } of LITERAL_PATTERNS) {
      if (re.test(content)) {
        findings.push({ file: rel, what: name });
      }
    }
  }

  console.log(`🔍 掃描 ${files.length} 個 client bundle 檔案`);
  console.log(`   比對 ${activeSecrets.length} 個環境機密 + ${LITERAL_PATTERNS.length} 組字面樣式`);
  if (skipped.length > 0) {
    // 這是重要提醒：未設定的變數等於沒被檢查，CI 上必須確保機密有載入。
    console.log(`   ⓘ 未設定因而未檢查：${skipped.join(', ')}`);
  }

  if (findings.length === 0) {
    console.log('✅ Client bundle 中未發現機密。');
    process.exit(0);
  }

  console.error('\n❌ 在 client bundle 中發現機密：');
  for (const { file, what } of findings) {
    console.error(`   ${file}\n      → ${what}`);
  }
  console.error(
    '\n修正方式：找出引用該變數的 client component（帶 "use client" 的檔案），' +
    '\n把讀取機密的邏輯移到 server component / API route，' +
    '\n並確認該變數沒有被加進 next.config.ts 的 env 區塊。'
  );
  process.exit(1);
}

main();
