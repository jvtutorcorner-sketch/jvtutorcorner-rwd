#!/usr/bin/env node
/**
 * Lambda bundler — the reusable build step for every Lambda worker (Phase 2.8).
 *
 * Bundles a handler.ts into a single CJS index.js under dist/<name>/, using the
 * same flags the livekit-webhook handler documented by hand:
 *   --bundle --platform=node --target=node20 --format=cjs --alias:@=. --external:@aws-sdk/*
 * @aws-sdk/* is external because the Lambda Node 20 runtime already provides it.
 *
 * Usage:
 *   node scripts/build-lambda.mjs                 # build all registered lambdas
 *   node scripts/build-lambda.mjs smoke           # build one
 *   node scripts/build-lambda.mjs --zip           # also produce dist/<name>.zip (needs `zip`/PowerShell)
 *
 * Output: dist/<name>/index.js. Deployment zips dist/<name>/ and uploads it
 * (CloudFormation Code.S3Bucket/S3Key). Deploying is a gated AWS action — this
 * script only builds locally.
 */
import { build } from 'esbuild';
import { existsSync, statSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';

// Registry of deployable lambdas: name → handler entry.
export const LAMBDAS = {
  smoke: 'lambda/smoke/handler.ts',
  'livekit-token': 'lambda/livekit-token/handler.ts',
  'livekit-webhook': 'lambda/livekit-webhook/handler.ts',
  // Phase 3 workers register here as they land:
  // 'ai-l1-detector': 'lambda/ai-l1-detector/handler.ts',
  // 'ai-segment': 'lambda/ai-segment/handler.ts',
};

const repoRoot = path.resolve(import.meta.dirname, '..');

export async function buildLambda(name, entry) {
  const abs = path.join(repoRoot, entry);
  if (!existsSync(abs)) throw new Error(`handler not found: ${entry}`);
  const outfile = path.join(repoRoot, 'dist', name, 'index.js');
  await build({
    entryPoints: [abs],
    outfile,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    alias: { '@': repoRoot },
    external: ['@aws-sdk/*'],
    logLevel: 'silent',
  });
  return outfile;
}

async function main() {
  const args = process.argv.slice(2);
  const zip = args.includes('--zip');
  const names = args.filter((a) => !a.startsWith('--'));
  const targets = names.length ? names : Object.keys(LAMBDAS);

  let failed = 0;
  for (const name of targets) {
    const entry = LAMBDAS[name];
    if (!entry) { console.error(`❌ unknown lambda "${name}" (known: ${Object.keys(LAMBDAS).join(', ')})`); failed++; continue; }
    try {
      const out = await buildLambda(name, entry);
      const kb = (statSync(out).size / 1024).toFixed(1);
      console.log(`✅ ${name} → dist/${name}/index.js (${kb} KB)`);
      if (zip) {
        const distDir = path.join(repoRoot, 'dist', name);
        mkdirSync(distDir, { recursive: true });
        const zipPath = path.join(repoRoot, 'dist', `${name}.zip`);
        try {
          if (process.platform === 'win32') {
            execSync(`powershell -NoProfile -Command "Compress-Archive -Force -Path '${distDir}\\*' -DestinationPath '${zipPath}'"`, { stdio: 'ignore' });
          } else {
            execSync(`cd "${distDir}" && zip -q -r "${zipPath}" .`, { stdio: 'ignore' });
          }
          console.log(`   📦 dist/${name}.zip`);
        } catch {
          console.warn(`   ⚠ zip skipped (no zip tool); zip dist/${name}/ manually for deploy`);
        }
      }
    } catch (e) {
      console.error(`❌ ${name}: ${e.message}`);
      failed++;
    }
  }
  process.exit(failed ? 1 : 0);
}

// Only run main when invoked directly (not when imported by a verifier).
if (path.resolve(process.argv[1] || '') === path.resolve(import.meta.filename)) {
  main();
}
