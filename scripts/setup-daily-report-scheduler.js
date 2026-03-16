#!/usr/bin/env node
/**
 * Setup script for Daily Report Scheduler on AWS
 * 
 * Prerequisites:
 * - AWS CLI configured with appropriate permissions
 * - CloudFormation stack deployment permissions
 * 
 * Usage:
 *   node scripts/setup-daily-report-scheduler.js --app-url https://your-app.amplifyapp.com --cron-secret your-secret
 * 
 * Or interactively:
 *   node scripts/setup-daily-report-scheduler.js
 */

const { execSync } = require('child_process');
const readline = require('readline');

const STACK_NAME = 'jvtutor-daily-report-scheduler';
const TEMPLATE_FILE = 'cloudformation/daily-report-scheduler.yml';
const REGION = process.env.AWS_REGION || 'ap-northeast-1';

async function prompt(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

async function main() {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  JV Tutor - Daily Report Scheduler Setup        ║');
    console.log('║  AWS EventBridge + Lambda                       ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');

    // Parse args
    const args = process.argv.slice(2);
    let appUrl = '', cronSecret = '';

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--app-url' && args[i + 1]) appUrl = args[++i];
        if (args[i] === '--cron-secret' && args[i + 1]) cronSecret = args[++i];
    }

    // Interactive prompts if not provided
    if (!appUrl) {
        appUrl = await prompt('🌐 Amplify 應用程式 URL (e.g., https://main.xxxxx.amplifyapp.com): ');
    }
    if (!cronSecret) {
        cronSecret = await prompt('🔑 CRON_SECRET (與 .env.local 中的值一致): ');
    }

    if (!appUrl || !cronSecret) {
        console.error('❌ APP_BASE_URL 和 CRON_SECRET 都是必填項');
        process.exit(1);
    }

    console.log('');
    console.log(`📋 設定摘要:`);
    console.log(`   Region:      ${REGION}`);
    console.log(`   Stack:       ${STACK_NAME}`);
    console.log(`   App URL:     ${appUrl}`);
    console.log(`   Schedule:    Every day at 00:00 Taiwan Time (16:00 UTC)`);
    console.log(`   CRON_SECRET: ${'*'.repeat(cronSecret.length)}`);
    console.log('');

    const confirm = await prompt('確認部署？(y/N): ');
    if (confirm.toLowerCase() !== 'y') {
        console.log('❌ 取消部署');
        process.exit(0);
    }

    console.log('');
    console.log('🚀 正在部署 CloudFormation Stack...');
    console.log('');

    try {
        const cmd = [
            'aws', 'cloudformation', 'deploy',
            '--template-file', TEMPLATE_FILE,
            '--stack-name', STACK_NAME,
            '--region', REGION,
            '--capabilities', 'CAPABILITY_NAMED_IAM',
            '--parameter-overrides',
            `AppBaseUrl=${appUrl}`,
            `CronSecret=${cronSecret}`,
            `ScheduleExpression="cron(0 16 * * ? *)"`,
        ].join(' ');

        execSync(cmd, { stdio: 'inherit' });

        console.log('');
        console.log('✅ 部署成功！');
        console.log('');
        console.log('📊 查看排程狀態:');
        console.log(`   aws events describe-rule --name jvtutor-daily-report-schedule --region ${REGION}`);
        console.log('');
        console.log('📋 查看 Lambda 日誌:');
        console.log(`   aws logs tail /aws/lambda/jvtutor-daily-report-scheduler --region ${REGION} --follow`);
        console.log('');
        console.log('🧪 手動測試觸發:');
        console.log(`   aws lambda invoke --function-name jvtutor-daily-report-scheduler --region ${REGION} --payload '{}' /dev/stdout`);
        console.log('');
    } catch (error) {
        console.error('❌ 部署失敗:', error.message);
        console.log('');
        console.log('🔧 常見問題:');
        console.log('   1. 確認 AWS CLI 已安裝: aws --version');
        console.log('   2. 確認已登入: aws sts get-caller-identity');
        console.log('   3. 確認有 CloudFormation + Lambda + Events 權限');
        process.exit(1);
    }
}

main();
