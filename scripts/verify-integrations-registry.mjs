#!/usr/bin/env node
// scripts/verify-integrations-registry.mjs
//
// 離線回歸測試：不連網、不碰資料表。驗證 registry / mask / migrationPlan 的正確性。
// 用法：node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-integrations-registry.mjs
// 退出碼：0 = 全過；1 = 有失敗。

import { randomUUID } from 'node:crypto';
import {
    PROVIDERS, listProviders, getProvider, secretKeysOf, normalizeLegacyConfig, validateConfig,
} from '@/lib/integrations/registry';
import { maskConfig, mergeSecrets, isMaskedValue, MASK_CHAR } from '@/lib/integrations/mask';
import { planMigration } from '@/lib/integrations/migrationPlan';

let passed = 0, failed = 0;
function check(label, cond, detail = '') {
    if (cond) { passed++; console.log(`  ✓ ${label}`); }
    else { failed++; console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
}

console.log('\n[1] registry 完整性');
{
    // 每個 provider 的 field key 唯一
    for (const p of listProviders()) {
        const keys = p.fields.map((f) => f.key);
        const dup = keys.find((k, i) => keys.indexOf(k) !== i);
        check(`${p.type} 欄位 key 唯一`, !dup, dup ? `重複: ${dup}` : '');
    }
    // secret 欄位型別限定
    for (const p of listProviders()) {
        const bad = p.fields.find((f) => f.secret && !['password', 'textarea', 'json'].includes(f.type));
        check(`${p.type} secret 欄位型別合法`, !bad, bad ? `${bad.key}=${bad.type}` : '');
    }
    // 舊 _types.ts 的所有 type 都被涵蓋
    const legacyTypes = ['ECPAY', 'PAYPAL', 'STRIPE', 'LINEPAY', 'JKOPAY', 'LINE', 'TELEGRAM', 'WHATSAPP', 'MESSENGER', 'SLACK', 'TEAMS', 'DISCORD', 'WECHAT', 'GMAIL', 'DYNAMODB', 'MONGODB', 'POSTGRESQL', 'MYSQL', 'REDIS', 'QDRANT', 'OPENAI', 'ANTHROPIC', 'GEMINI', 'SMART_ROUTER', 'AI_CHATROOM', 'ASK_PLAN_AGENT', 'CONTEXT7'];
    for (const t of legacyTypes) check(`registry 涵蓋 ${t}`, !!getProvider(t));
}

console.log('\n[2] TEST_HANDLERS ↔ registry testConnection 一致（已知具測試能力的 type）');
{
    // 具備測試 handler 的 type（來自 test route 的 TEST_HANDLERS）
    const handlerTypes = ['LINE', 'TELEGRAM', 'WHATSAPP', 'MESSENGER', 'SLACK', 'TEAMS', 'DISCORD', 'WECHAT', 'ECPAY', 'STRIPE', 'PAYPAL', 'LINEPAY', 'JKOPAY', 'OPENAI', 'ANTHROPIC', 'GEMINI', 'GMAIL', 'SMTP', 'RESEND', 'CONTEXT7'];
    for (const t of handlerTypes) {
        const p = getProvider(t);
        check(`${t} 有 handler 且 registry testConnection=true`, !!p && p.capabilities.testConnection === true);
    }
}

console.log('\n[3] mergeSecrets 六種情況');
{
    const existing = { secretKey: 'sk_REAL_9999', publicKey: 'pk_1', name: 'x' };
    const sk = ['secretKey'];
    // (a) 遮罩值 → 保留
    check('遮罩值保留原密鑰', mergeSecrets({ secretKey: `${MASK_CHAR}${MASK_CHAR}9999` }, existing, sk).secretKey === 'sk_REAL_9999');
    // (b) 空字串 secret → 保留
    check('空字串保留原密鑰', mergeSecrets({ secretKey: '' }, existing, sk).secretKey === 'sk_REAL_9999');
    // (c) undefined secret → 保留
    check('未送保留原密鑰', mergeSecrets({}, existing, sk).secretKey === 'sk_REAL_9999');
    // (d) 明文新值 → 覆寫
    check('明文覆寫密鑰', mergeSecrets({ secretKey: 'sk_NEW' }, existing, sk).secretKey === 'sk_NEW');
    // (e) __clear → 清除
    check('__clear 清除密鑰', !('secretKey' in mergeSecrets({ secretKey: { __clear: true } }, existing, sk)));
    // (f) 非 secret 空字串 → 清除
    check('非密鑰空字串清除', !('publicKey' in mergeSecrets({ publicKey: '' }, existing, sk)));
}

console.log('\n[4] maskConfig 不外洩明文');
{
    const cfg = { secretKey: 'sk_TOPSECRET_ABCD', publicKey: 'pk_visible' };
    const masked = maskConfig(cfg, secretKeysOf('STRIPE'));
    const json = JSON.stringify(masked);
    check('遮罩後不含明文密鑰', !json.includes('sk_TOPSECRET_ABCD'), json);
    check('遮罩值可被 isMaskedValue 偵測', isMaskedValue(masked.secretKey));
    check('非密鑰維持明文', masked.publicKey === 'pk_visible');
    check('遮罩保留末四碼', String(masked.secretKey).endsWith('ABCD'));
}

console.log('\n[5] normalizeLegacyConfig 別名轉換');
{
    const n = normalizeLegacyConfig('ECPAY', { ecpayMerchantId: 'M1', ecpayHashKey: 'K', ecpayHashIV: 'IV' });
    check('ECPay 別名轉正規 key', n.merchantId === 'M1' && n.hashKey === 'K' && n.hashIV === 'IV');
    const s = normalizeLegacyConfig('STRIPE', { stripeSecretKey: 'sk', stripePublicKey: 'pk', stripeAccountId: 'acct' });
    check('Stripe 別名轉正規 key', s.secretKey === 'sk' && s.publicKey === 'pk' && s.accountId === 'acct');
}

console.log('\n[6] validateConfig 必填');
{
    check('STRIPE 缺 secretKey 不通過', validateConfig('STRIPE', { publicKey: 'pk' }).ok === false);
    check('STRIPE 完整通過', validateConfig('STRIPE', { publicKey: 'pk', secretKey: 'sk' }).ok === true);
    check('partial 模式略過必填', validateConfig('STRIPE', { publicKey: 'pk' }, { partial: true }).ok === true);
    check('未知 type 視為通過', validateConfig('FOO_UNKNOWN', {}).ok === true);
}

console.log('\n[7] planMigration 去重 / 預設 / 缺 id');
{
    const items = [
        { integrationId: 'a1', userId: 'u1', type: 'GMAIL', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00Z', config: { smtpPass: '  p  ', fromAddress: 'a@x' } },
        { integrationId: 'a2', userId: 'u2', type: 'GMAIL', status: 'ACTIVE', createdAt: '2026-02-01T00:00:00Z', config: { smtpPass: 'q', fromAddress: 'b@x' } },
        { userId: 'u3', type: 'LINE', status: 'ACTIVE', createdAt: '2026-01-05T00:00:00Z', config: { channelAccessToken: 't', channelSecret: 's' } }, // 缺 id
        { integrationId: 'skip', userId: 'u4', config: { webhookUrl: 'x' } }, // 缺 type → 略過
    ];
    const plan = planMigration(items, randomUUID);
    check('略過缺 type 的資料', plan.skipped.length === 1);
    check('遷移 3 筆', plan.records.length === 3);
    check('GMAIL 預設選最早(a1)', plan.defaultsByType['GMAIL'] === 'a1');
    check('缺 id 者已補新 id', plan.idsRegenerated.length === 1);
    const line = plan.records.find((r) => r.type === 'LINE');
    check('config 去除頭尾空白', plan.records.find((r) => r.integrationId === 'a1').config.smtpPass === 'p');
    check('LINE 也被設為其 type 的 default', line.isDefault === true);
}

console.log(`\n結果：通過 ${passed}、失敗 ${failed}`);
process.exit(failed > 0 ? 1 : 0);
