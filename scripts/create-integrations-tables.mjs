#!/usr/bin/env node
// scripts/create-integrations-tables.mjs
//
// 建立 /apps 後台重構所需的新資料表（若不存在，只建不改）。
//
// 執行：
//   node --env-file=.env.local scripts/create-integrations-tables.mjs --dry-run
//   node --env-file=.env.local scripts/create-integrations-tables.mjs
//   node --env-file=.env.local scripts/create-integrations-tables.mjs --only=integrations
//
// 表：
//   integrations       PK integrationId；GSI byType(type HASH, createdAt RANGE)
//   integrationConfig  PK configKey（catalog-overrides / dispatch-prompt / execution-env-meta）
//   aiSkills           PK id
//   platformAgents     PK id

import { DynamoDBClient, CreateTableCommand, DescribeTableCommand, waitUntilTableExists } from '@aws-sdk/client-dynamodb';
import { parseOnlyArg, parseDryRunArg, selectSteps, unknownArgs } from './lib/setup-steps.mjs';

const region = process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1';
const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;
const sessionToken = process.env.AWS_SESSION_TOKEN || process.env.CI_AWS_SESSION_TOKEN;
const client = new DynamoDBClient({
    region,
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey, ...(sessionToken ? { sessionToken } : {}) } : undefined,
});

const TAGS = [
    { Key: 'project', Value: 'jvtutorcorner' },
    { Key: 'module', Value: 'integrations' },
];

const STEPS = [
    {
        key: 'integrations',
        name: process.env.DYNAMODB_TABLE_INTEGRATIONS || 'jvtutorcorner-integrations',
        def: (TableName) => ({
            TableName,
            BillingMode: 'PAY_PER_REQUEST',
            SSESpecification: { Enabled: true },
            AttributeDefinitions: [
                { AttributeName: 'integrationId', AttributeType: 'S' },
                { AttributeName: 'type', AttributeType: 'S' },
                { AttributeName: 'createdAt', AttributeType: 'S' },
            ],
            KeySchema: [{ AttributeName: 'integrationId', KeyType: 'HASH' }],
            GlobalSecondaryIndexes: [{
                IndexName: 'byType',
                KeySchema: [
                    { AttributeName: 'type', KeyType: 'HASH' },
                    { AttributeName: 'createdAt', KeyType: 'RANGE' },
                ],
                Projection: { ProjectionType: 'ALL' },
            }],
            Tags: TAGS,
        }),
    },
    {
        key: 'integrationConfig',
        name: process.env.DYNAMODB_TABLE_INTEGRATION_CONFIG || 'jvtutorcorner-integration-config',
        def: (TableName) => ({
            TableName,
            BillingMode: 'PAY_PER_REQUEST',
            SSESpecification: { Enabled: true },
            AttributeDefinitions: [{ AttributeName: 'configKey', AttributeType: 'S' }],
            KeySchema: [{ AttributeName: 'configKey', KeyType: 'HASH' }],
            Tags: TAGS,
        }),
    },
    {
        key: 'aiSkills',
        name: process.env.DYNAMODB_TABLE_AI_SKILLS || 'jvtutorcorner-ai-skills',
        def: (TableName) => ({
            TableName,
            BillingMode: 'PAY_PER_REQUEST',
            SSESpecification: { Enabled: true },
            AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
            KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
            Tags: TAGS,
        }),
    },
    {
        key: 'platformAgents',
        name: process.env.DYNAMODB_TABLE_PLATFORM_AGENTS || 'jvtutorcorner-platform-agents',
        def: (TableName) => ({
            TableName,
            BillingMode: 'PAY_PER_REQUEST',
            SSESpecification: { Enabled: true },
            AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
            KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
            Tags: TAGS,
        }),
    },
];

async function tableExists(name) {
    try {
        await client.send(new DescribeTableCommand({ TableName: name }));
        return true;
    } catch (err) {
        if (err.name === 'ResourceNotFoundException') return false;
        throw err;
    }
}

async function main() {
    const argv = process.argv.slice(2);
    const bad = unknownArgs(argv);
    if (bad.length) {
        console.error(`Unknown argument(s): ${bad.join(', ')}`);
        process.exit(2);
    }
    const dryRun = parseDryRunArg(argv);
    const only = parseOnlyArg(argv);
    const { selected, skipped } = selectSteps(only, STEPS);

    console.log(`[create-integrations-tables] region=${region} dryRun=${dryRun}`);
    console.log(`[create-integrations-tables] 目標表: ${selected.map((s) => s.name).join(', ')}`);
    if (skipped.length) console.log(`[create-integrations-tables] 略過: ${skipped.map((s) => s.name).join(', ')}`);

    for (const step of selected) {
        const exists = await tableExists(step.name);
        if (exists) {
            console.log(`  ✓ 已存在，略過: ${step.name}`);
            continue;
        }
        if (dryRun) {
            console.log(`  [dry-run] 將建立: ${step.name}`);
            continue;
        }
        console.log(`  → 建立: ${step.name}`);
        await client.send(new CreateTableCommand(step.def(step.name)));
        await waitUntilTableExists({ client, maxWaitTime: 120 }, { TableName: step.name });
        console.log(`  ✅ 完成: ${step.name}`);
    }
    console.log('[create-integrations-tables] 結束。');
}

main().catch((err) => {
    console.error('[create-integrations-tables] ❌ 失敗:', err);
    process.exit(1);
});
