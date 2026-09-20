#!/usr/bin/env node
// scripts/migrate-integrations.mjs
//
// 把舊表 jvtutorcorner-app-integrations（PK userId+type）遷移到新表
// jvtutorcorner-integrations（PK integrationId + GSI byType）。
//
// 安全預設：不帶 --apply 一律 dry-run，只印計畫，不寫入。
//   node --import ./scripts/lib/register-ts-resolve.mjs --env-file=.env.local scripts/migrate-integrations.mjs
//   node --import ./scripts/lib/register-ts-resolve.mjs --env-file=.env.local scripts/migrate-integrations.mjs --apply --i-know-this-is-prod
//   （再加 --verify 比對筆數與 key 集合）
//
// 原則：保留 integrationId（LINE webhook URL 內含它）、以 attribute_not_exists 條件寫入
// 可重複執行、絕不刪除、不碰舊表。密鑰只印末四碼。

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import { planMigration } from '@/lib/integrations/migrationPlan';
import { secretKeysOf } from '@/lib/integrations/registry';

const region = process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1';
const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;
const sessionToken = process.env.AWS_SESSION_TOKEN || process.env.CI_AWS_SESSION_TOKEN;
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({
    region,
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey, ...(sessionToken ? { sessionToken } : {}) } : undefined,
}), { marshallOptions: { removeUndefinedValues: true } });

const OLD_TABLE = process.env.DYNAMODB_TABLE_APP_INTEGRATIONS || 'jvtutorcorner-app-integrations';
const NEW_TABLE = process.env.DYNAMODB_TABLE_INTEGRATIONS || 'jvtutorcorner-integrations';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const KNOW_PROD = argv.includes('--i-know-this-is-prod');
const VERIFY = argv.includes('--verify');
const isProd = (process.env.APP_ENV || '').toLowerCase() === 'production' || (process.env.NODE_ENV === 'production');

function last4(v) {
    if (typeof v !== 'string') return '(non-string)';
    return v.length > 4 ? `••••${v.slice(-4)}` : '••••';
}

function printConfig(type, config) {
    const secrets = new Set(secretKeysOf(type));
    const shown = {};
    for (const [k, v] of Object.entries(config || {})) {
        shown[k] = secrets.has(k) ? last4(v) : (Array.isArray(v) ? v : v);
    }
    return shown;
}

async function scanAll(table) {
    const items = [];
    let ExclusiveStartKey;
    do {
        const res = await doc.send(new ScanCommand({ TableName: table, ExclusiveStartKey }));
        items.push(...(res.Items || []));
        ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
}

async function main() {
    console.log('='.repeat(70));
    console.log('[migrate-integrations]');
    console.log(`  region      : ${region}`);
    console.log(`  APP_ENV     : ${process.env.APP_ENV || '(unset)'}`);
    console.log(`  來源(舊)     : ${OLD_TABLE}`);
    console.log(`  目標(新)     : ${NEW_TABLE}`);
    console.log(`  模式         : ${APPLY ? 'APPLY（實際寫入）' : 'DRY-RUN（僅預覽）'}`);
    console.log('='.repeat(70));

    if (APPLY && isProd && !KNOW_PROD) {
        console.error('\n❌ 偵測到 production 環境。實際寫入需額外加上 --i-know-this-is-prod 旗標。');
        process.exit(2);
    }

    const legacy = await scanAll(OLD_TABLE);
    console.log(`\n舊表共 ${legacy.length} 筆。`);

    const plan = planMigration(legacy, randomUUID);

    console.log(`\n── 計畫摘要 ─────────────────────────────`);
    console.log(`  將遷移      : ${plan.records.length} 筆`);
    console.log(`  略過(非整合) : ${plan.skipped.length} 筆`);
    console.log(`  重新產生 id  : ${plan.idsRegenerated.length} 筆`);
    console.log(`  警告         : ${plan.warnings.length} 則`);

    console.log(`\n── 每個 type 的預設連線（請人工確認，尤其 GMAIL）──`);
    for (const [type, id] of Object.entries(plan.defaultsByType)) {
        console.log(`  ${type.padEnd(16)} → ${id}`);
    }

    console.log(`\n── 遷移明細 ─────────────────────────────`);
    for (const r of plan.records) {
        console.log(`  [${r.type}] ${r.name} (id=${r.integrationId}, status=${r.status}, default=${r.isDefault})`);
        console.log(`      config: ${JSON.stringify(printConfig(r.type, r.config))}`);
        console.log(`      legacy: userId=${r.legacy.userId ?? '?'}`);
    }

    if (plan.skipped.length) {
        console.log(`\n── 略過項目 ─────────────────────────────`);
        for (const s of plan.skipped) console.log(`  ${s.reason} :: ${JSON.stringify(s.item).slice(0, 120)}`);
    }
    if (plan.warnings.length) {
        console.log(`\n── 警告 ─────────────────────────────`);
        for (const w of plan.warnings) console.log(`  ⚠ ${w}`);
    }

    if (!APPLY) {
        console.log('\n（DRY-RUN 未寫入。確認以上內容後，加 --apply 執行。）');
        return;
    }

    console.log(`\n── 寫入新表（attribute_not_exists 條件，可重跑）──`);
    let written = 0, existed = 0, errored = 0;
    for (const r of plan.records) {
        try {
            await doc.send(new PutCommand({
                TableName: NEW_TABLE,
                Item: r,
                ConditionExpression: 'attribute_not_exists(integrationId)',
            }));
            written++;
            console.log(`  ✅ 寫入 ${r.integrationId} (${r.type})`);
        } catch (e) {
            if (e?.name === 'ConditionalCheckFailedException') {
                existed++;
                console.log(`  ↷ 已存在，略過 ${r.integrationId} (${r.type})`);
            } else {
                errored++;
                console.error(`  ❌ 失敗 ${r.integrationId}: ${e?.message || e}`);
            }
        }
    }
    console.log(`\n寫入完成：新增 ${written}、已存在 ${existed}、失敗 ${errored}`);

    if (VERIFY) {
        console.log(`\n── 驗證（比對每筆 config key 集合）──`);
        let ok = 0, mismatch = 0;
        for (const r of plan.records) {
            const res = await doc.send(new GetCommand({ TableName: NEW_TABLE, Key: { integrationId: r.integrationId } }));
            if (!res.Item) { console.error(`  ❌ 找不到 ${r.integrationId}`); mismatch++; continue; }
            const a = Object.keys(r.config).sort().join(',');
            const b = Object.keys(res.Item.config || {}).sort().join(',');
            if (a === b) ok++;
            else { mismatch++; console.error(`  ❌ key 不符 ${r.integrationId}: 計畫[${a}] vs 實際[${b}]`); }
        }
        console.log(`驗證：一致 ${ok}、不符 ${mismatch}`);
    }
}

main().catch((err) => {
    console.error('[migrate-integrations] ❌ 失敗:', err);
    process.exit(1);
});
