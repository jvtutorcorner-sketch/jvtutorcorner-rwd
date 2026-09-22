#!/usr/bin/env node
/**
 * Lambda toolchain verifier (offline, no AWS):
 *   1. Bundles the smoke handler → dist/smoke/index.js exists & non-trivial.
 *   2. Bundles livekit-webhook → @aws-sdk/* stays external (require), but
 *      livekit-server-sdk is bundled in (correct external/bundle split).
 *   3. The two CloudFormation templates have the key resources (Streams
 *      event-source mapping + DLQ + on-failure; S3 invoke permission + DLQ).
 *
 * Usage: node scripts/build-lambda.mjs must be importable (esbuild installed).
 *   node scripts/verify-lambda-build.mjs
 */
import { readFileSync, statSync, existsSync } from 'fs';
import path from 'path';
import { buildLambda } from './build-lambda.mjs';

const repo = path.resolve(import.meta.dirname, '..');
let failed = 0, passed = 0;
const check = (l, c, d = '') => { if (c) { passed++; console.log(`  ✅ ${l}`); } else { failed++; console.log(`  ❌ ${l}${d ? `  (${d})` : ''}`); } };

console.log('[1] bundle smoke handler');
{
  const out = await buildLambda('smoke', 'lambda/smoke/handler.ts');
  check('dist/smoke/index.js 產生', existsSync(out));
  check('bundle 非空 (>300 bytes)', statSync(out).size > 300, `${statSync(out).size}b`);
  check('含 handler export', /handler:|handler_exports|exports\.handler/.test(readFileSync(out, 'utf8')));
}

console.log('\n[2] external/bundle split (livekit-webhook)');
{
  const out = await buildLambda('livekit-webhook', 'lambda/livekit-webhook/handler.ts');
  const js = readFileSync(out, 'utf8');
  check('@aws-sdk 保持 external (require, runtime 提供)', /require\("@aws-sdk\//.test(js));
  check('livekit-server-sdk 被 bundle 進去 (非 external)', js.includes('livekit-server-sdk'));
}

console.log('\n[3] CloudFormation 模板結構');
{
  const streams = readFileSync(path.join(repo, 'cloudformation', 'lambda-streams-worker.yml'), 'utf8');
  check('streams: 有 EventSourceMapping', streams.includes('AWS::Lambda::EventSourceMapping'));
  check('streams: 有 DLQ (SQS)', streams.includes('AWS::SQS::Queue'));
  check('streams: 有 on-failure destination', /DestinationConfig[\s\S]*OnFailure/.test(streams));
  check('streams: 有 MaximumRetryAttempts + bisect', streams.includes('MaximumRetryAttempts') && streams.includes('BisectBatchOnFunctionError'));
  check('streams: 有 FilterCriteria', streams.includes('FilterCriteria'));

  const s3 = readFileSync(path.join(repo, 'cloudformation', 'lambda-s3-worker.yml'), 'utf8');
  check('s3: 有 Lambda::Permission (S3 invoke)', s3.includes('AWS::Lambda::Permission') && s3.includes('s3.amazonaws.com'));
  check('s3: 有 DLQ', s3.includes('AWS::SQS::Queue'));
  check('s3: 有 GetObject 權限', s3.includes('s3:GetObject'));
}

console.log(`\n${failed === 0 ? '✅ 全部通過' : '❌ 有失敗'} — passed ${passed}, failed ${failed}`);
process.exit(failed === 0 ? 0 : 1);
