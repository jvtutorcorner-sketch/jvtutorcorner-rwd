#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import dotenv from 'dotenv';

const projectRoot = process.cwd();
const teamProviderInfoPath = path.join(projectRoot, 'amplify', 'team-provider-info.json');
const packageJsonPath = path.join(projectRoot, 'package.json');
const defaultOutputPath = path.join(projectRoot, '.env.production');
const preferredBranchNames = ['main', 'master', 'production', 'prod'];

function parseArgs(argv) {
  const options = {
    appId: process.env.AMPLIFY_APP_ID || '',
    branch: process.env.AMPLIFY_BRANCH || '',
    region: process.env.AWS_REGION || '',
    output: defaultOutputPath,
    profile: process.env.AWS_PROFILE || '',
    mergeExisting: true,
    backup: true,
    dryRun: false,
    verbose: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--app-id':
        options.appId = argv[++i] || '';
        break;
      case '--branch':
        options.branch = argv[++i] || '';
        break;
      case '--region':
        options.region = argv[++i] || '';
        break;
      case '--output':
        options.output = path.resolve(projectRoot, argv[++i] || '.env.production');
        break;
      case '--profile':
        options.profile = argv[++i] || '';
        break;
      case '--merge-existing':
        options.mergeExisting = true;
        break;
      case '--replace':
        options.mergeExisting = false;
        break;
      case '--no-backup':
        options.backup = false;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/sync-amplify-env-to-dotenv.mjs [options]

Options:
  --app-id <id>         Amplify App ID. Defaults to AMPLIFY_APP_ID or amplify/team-provider-info.json
  --branch <name>       Amplify branch name. Defaults to AMPLIFY_BRANCH or auto-detected branch
  --region <region>     AWS region. Defaults to AWS_REGION or amplify/team-provider-info.json
  --output <path>       Output dotenv file path. Default: .env.production
  --profile <profile>   AWS CLI profile to use
  --merge-existing      Merge with existing dotenv file and let Amplify values override duplicates
  --replace             Replace the target dotenv file instead of merging with existing keys
  --no-backup           Do not create a .bak file before overwriting
  --dry-run             Print the generated dotenv content instead of writing the file
  --verbose             Print additional diagnostics
  --help, -h            Show this help
`);
}

function readTeamProviderDefaults() {
  if (!fs.existsSync(teamProviderInfoPath)) {
    return { appId: '', region: '' };
  }

  const raw = fs.readFileSync(teamProviderInfoPath, 'utf8');
  const parsed = JSON.parse(raw);
  const firstEnv = Object.values(parsed)[0];
  const awsCloudFormation = firstEnv?.awscloudformation || {};

  return {
    appId: awsCloudFormation.AmplifyAppId || '',
    region: awsCloudFormation.Region || '',
  };
}

function readPackageName() {
  if (!fs.existsSync(packageJsonPath)) return '';
  try {
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return parsed.name || '';
  } catch {
    return '';
  }
}

function runAwsCliJson(args, options) {
  const fullArgs = [...args, '--output', 'json'];
  if (options.region) fullArgs.push('--region', options.region);
  if (options.profile) fullArgs.push('--profile', options.profile);

  if (options.verbose) {
    console.log(`[sync-amplify-env] aws ${fullArgs.join(' ')}`);
  }

  let stdout = '';
  try {
    stdout = execFileSync('aws', fullArgs, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const stderr = String(error.stderr || '').trim();
    const detail = stderr ? `\n\n${stderr}` : '';
    throw new Error(`Command failed: aws ${fullArgs.join(' ')}${detail}`);
  }

  return JSON.parse(stdout);
}

function detectBranchName(appId, options) {
  if (options.branch) return options.branch;

  const response = runAwsCliJson(['amplify', 'list-branches', '--app-id', appId], options);
  const branches = Array.isArray(response.branches) ? response.branches : [];
  if (branches.length === 0) {
    throw new Error(`No Amplify branches found for app ${appId}`);
  }

  const preferred = preferredBranchNames
    .map((name) => branches.find((branch) => branch.branchName === name))
    .find(Boolean);

  return preferred?.branchName || branches[0].branchName;
}

function chooseBestAmplifyApp(options) {
  const packageName = readPackageName();
  const response = runAwsCliJson(['amplify', 'list-apps'], options);
  const apps = Array.isArray(response.apps) ? response.apps : [];

  if (apps.length === 0) {
    throw new Error('No Amplify apps found in this AWS account.');
  }

  const byExactName = packageName
    ? apps.find((app) => app.name === packageName && app.productionBranch?.branchName)
    : null;
  if (byExactName) return byExactName;

  const byNameContains = packageName
    ? apps.find((app) => app.name?.includes(packageName) && app.productionBranch?.branchName)
    : null;
  if (byNameContains) return byNameContains;

  const byProductionBranch = apps.find((app) => app.productionBranch?.branchName);
  if (byProductionBranch) return byProductionBranch;

  return apps[0];
}

function resolveAppId(initialAppId, options) {
  const appId = initialAppId;
  if (!appId) {
    const best = chooseBestAmplifyApp(options);
    return { appId: best.appId, inferred: true };
  }

  try {
    const branches = runAwsCliJson(['amplify', 'list-branches', '--app-id', appId], options);
    if (Array.isArray(branches.branches) && branches.branches.length > 0) {
      return { appId, inferred: false };
    }
  } catch (error) {
    if (options.verbose) {
      console.warn(`[sync-amplify-env] Failed to validate app ${appId}: ${error.message}`);
    }
  }

  const best = chooseBestAmplifyApp(options);
  return { appId: best.appId, inferred: best.appId !== appId };
}

function readExistingEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return dotenv.parse(fs.readFileSync(filePath, 'utf8'));
}

function serializeEnvValue(value) {
  const stringValue = String(value ?? '');
  if (stringValue === '') return '';
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(stringValue)) {
    return stringValue;
  }
  return JSON.stringify(stringValue);
}

function buildEnvFileContent(envMap, metadata) {
  const lines = [
    '# Synced from AWS Amplify Hosting',
    `# App ID: ${metadata.appId}`,
    `# Branch: ${metadata.branch}`,
    `# Region: ${metadata.region}`,
    `# Generated at: ${metadata.generatedAt}`,
    '',
  ];

  const keys = Object.keys(envMap).sort((a, b) => a.localeCompare(b));
  for (const key of keys) {
    lines.push(`${key}=${serializeEnvValue(envMap[key])}`);
  }

  lines.push('');
  return lines.join('\n');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const defaults = readTeamProviderDefaults();
  const resolvedApp = resolveAppId(options.appId || defaults.appId, options);
  const appId = resolvedApp.appId;
  const region = options.region || defaults.region || 'ap-northeast-1';

  if (!appId) {
    throw new Error('Amplify App ID is required. Pass --app-id or set AMPLIFY_APP_ID.');
  }

  options.region = region;
  const branch = detectBranchName(appId, options);
  const appInfo = runAwsCliJson(['amplify', 'get-app', '--app-id', appId], options);
  const branchInfo = runAwsCliJson(
    ['amplify', 'get-branch', '--app-id', appId, '--branch-name', branch],
    options
  );
  const appEnv = appInfo.app?.environmentVariables || {};
  const branchEnv = branchInfo.branch?.environmentVariables || {};
  const amplifyEnv = { ...appEnv, ...branchEnv };

  if (Object.keys(amplifyEnv).length === 0) {
    throw new Error(`No environmentVariables found for Amplify app ${appId} (app-level or branch ${branch})`);
  }

  const mergedEnv = options.mergeExisting
    ? { ...readExistingEnvFile(options.output), ...amplifyEnv }
    : amplifyEnv;

  const content = buildEnvFileContent(mergedEnv, {
    appId,
    branch,
    region,
    generatedAt: new Date().toISOString(),
  });

  if (options.dryRun) {
    process.stdout.write(content);
    return;
  }

  if (options.backup && fs.existsSync(options.output)) {
    fs.copyFileSync(options.output, `${options.output}.bak`);
  }

  fs.writeFileSync(options.output, content, 'utf8');

  console.log(`[sync-amplify-env] Wrote ${Object.keys(mergedEnv).length} vars to ${path.relative(projectRoot, options.output)}`);
  console.log(`[sync-amplify-env] Source: app=${appId} branch=${branch} region=${region}`);
  if (resolvedApp.inferred) {
    console.log('[sync-amplify-env] App ID was auto-corrected from the default selection.');
  }
  if (options.backup) {
    console.log(`[sync-amplify-env] Backup: ${path.relative(projectRoot, `${options.output}.bak`)}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`[sync-amplify-env] ${error.message}`);
  process.exit(1);
}
