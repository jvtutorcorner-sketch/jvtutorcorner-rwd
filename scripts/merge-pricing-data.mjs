#!/usr/bin/env node
/**
 * Merge pricing data from /pricing page with existing DynamoDB data
 * Preserves existing data and merges new plans without overwriting
 * Usage: node scripts/merge-pricing-data.mjs
 */

import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const PRICING_TABLE = process.env.DYNAMODB_TABLE_PRICING || 'jvtutorcorner-pricing';
const AWS_REGION = process.env.AWS_REGION || 'ap-northeast-1';

console.log(`📊 Merging Pricing Data`);
console.log(`   Table: ${PRICING_TABLE}`);
console.log(`   Region: ${AWS_REGION}\n`);

// Create DynamoDB client
const dynamoClient = new DynamoDBClient({ region: AWS_REGION });
const ddbDocClient = DynamoDBDocumentClient.from(dynamoClient);

// Plans from mockAuth and /pricing page
const PLAN_LABELS = {
  basic: 'Basic 普通會員',
  pro: 'Pro 中級會員',
  elite: 'Elite 高級會員',
  viewer: '新辦帳戶',
};

const PLAN_DESCRIPTIONS = {
  basic: '入門體驗：1對1視訊，無白板',
  pro: '主力方案：白板互動、小班制 2-6 人，錄影回放',
  elite: 'VIP 方案：大班制最多 30 人，家長旁聽，學習報表',
  viewer: '新辦帳戶：僅提供查詢師資與課程的基本功能',
};

const PLAN_PRICES = {
  basic: 'NT$199 / 月',
  pro: 'NT$599 / 月',
  elite: 'NT$1,499 / 月',
  viewer: 'NT$0 / 月（新辦方案）',
};

const PLAN_FEATURES = {
  basic: [
    '可預約老師',
    '1對1 一般畫質視訊上課',
    '無內建白板（Basic 方案不包含白板）',
    'App 基本功能：課表、通知、簡單評價',
  ],
  pro: [
    '高畫質視訊（720p / 1080p）',
    '內建對話白板，教師可授權學生白板書寫',
    '小班制 2–6 人同課，下辫旁聽旁聽',
    '課後雲端錄影回放（保留 7–30 天）',
    '優先客服：App 內客服／Line 客服',
    '老師選擇更多，可篩選專長、評價、時薪區間',
  ],
  elite: [
    '高速視訊、優先走高頻寬節點',
    '大班制最多 30 人同時上課',
    '家長旁聽連線（旁聽薪對總人數不占位）',
    '完整錄影，雲端保留 180–365 天，可提供下載',
    '高端師資：資深老師、名校背景、雙語／全英教學',
    '專屬客服窗口與學習報表：出席率、時數、主題統計',
  ],
  viewer: [
    '僅能瀏覽與查詢老師和課程清單',
    '無法預約或參與付費課程',
    '無白板與錄影回放功能',
  ],
};

const PLAN_TARGETS = {
  viewer: '僅供瀏覽與查詢師資／課程的使用者。',
  basic: '剛開始嘗試線上家教、想先試水溫的學生與家長。',
  pro: '固定每週上課、重視白板互動與小班制學習的學生／家長。',
  elite: '國際學校、補教體系、願投資高額家教且想要家長旁聽的 VIP 家長。',
};

// Create plan configs from /pricing page data
function createPlansFromPricingPage() {
  return [
    {
      id: 'viewer',
      label: PLAN_LABELS.viewer,
      priceHint: PLAN_PRICES.viewer,
      targetAudience: PLAN_TARGETS.viewer,
      includedFeatures: PLAN_DESCRIPTIONS.viewer,
      features: PLAN_FEATURES.viewer,
      isActive: true,
      order: 1
    },
    {
      id: 'basic',
      label: PLAN_LABELS.basic,
      priceHint: PLAN_PRICES.basic,
      targetAudience: PLAN_TARGETS.basic,
      includedFeatures: PLAN_DESCRIPTIONS.basic,
      features: PLAN_FEATURES.basic,
      isActive: true,
      order: 2
    },
    {
      id: 'pro',
      label: PLAN_LABELS.pro,
      priceHint: PLAN_PRICES.pro,
      badge: '推薦',
      targetAudience: PLAN_TARGETS.pro,
      includedFeatures: PLAN_DESCRIPTIONS.pro,
      features: PLAN_FEATURES.pro,
      isActive: true,
      order: 3
    },
    {
      id: 'elite',
      label: PLAN_LABELS.elite,
      priceHint: PLAN_PRICES.elite,
      targetAudience: PLAN_TARGETS.elite,
      includedFeatures: PLAN_DESCRIPTIONS.elite,
      features: PLAN_FEATURES.elite,
      isActive: true,
      order: 4
    }
  ];
}

async function mergePricingData() {
  try {
    console.log('📖 Reading existing pricing configuration...\n');

    // Step 1: Read existing data
    const getCommand = new GetCommand({
      TableName: PRICING_TABLE,
      Key: { id: 'pricing-config' },
    });

    const response = await ddbDocClient.send(getCommand);
    const existingData = response.Item || {};

    console.log('✅ Current state:');
    console.log(`   Plans: ${(existingData.plans || []).length} items`);
    console.log(`   Point Packages: ${(existingData.pointPackages || []).length} items\n`);

    // Step 2: Create plans from /pricing page
    const pricingPagePlans = createPlansFromPricingPage();

    // Step 3: Merge strategies
    // - Keep existing pointPackages (don't touch them)
    // - Update/merge plans from /pricing page while preserving existing ones
    const existingPlansMap = new Map((existingData.plans || []).map(p => [p.id, p]));
    const pricingPagePlansMap = new Map(pricingPagePlans.map(p => [p.id, p]));

    // Merge: Take plans from /pricing page, but keep any old plans that aren't there
    const mergedPlans = Array.from(pricingPagePlansMap.values()).map(newPlan => {
      const oldPlan = existingPlansMap.get(newPlan.id);
      // Prioritize /pricing page data but preserve any custom edits to non-core fields
      return {
        ...oldPlan,
        ...newPlan,
        // Preserve custom order if it was manually edited
        order: oldPlan?.customOrder !== undefined ? oldPlan.customOrder : newPlan.order
      };
    });

    console.log('📋 Plans from /pricing page:');
    pricingPagePlans.forEach((plan, idx) => {
      console.log(`   ${idx + 1}. ${plan.label} (${plan.priceHint})`);
    });

    // Step 4: Create merged config
    const mergedConfig = {
      id: 'pricing-config',
      pageTitle: existingData.pageTitle || '方案與價格',
      pageDescription: existingData.pageDescription || '選擇最適合您的會員方案',
      mode: existingData.mode || 'subscription',
      plans: mergedPlans,
      pointPackages: existingData.pointPackages || [], // Keep existing point packages
      updatedAt: new Date().toISOString(),
    };

    console.log(`\n💾 Writing merged data to DynamoDB...`);
    console.log(`   Plans: ${mergedPlans.length} items`);
    console.log(`   Point Packages: ${(mergedConfig.pointPackages || []).length} items\n`);

    const putCommand = new PutCommand({
      TableName: PRICING_TABLE,
      Item: mergedConfig
    });

    await ddbDocClient.send(putCommand);

    console.log('✅ Successfully merged pricing data!\n');
    console.log('📊 Merged configuration:');
    console.log(`   Plans: ${mergedPlans.length}`);
    mergedPlans.forEach((plan, idx) => {
      console.log(`   ${idx + 1}. ${plan.label} | ${plan.priceHint}`);
    });
    console.log(`\n   Point Packages: ${(mergedConfig.pointPackages || []).length}`);
    (mergedConfig.pointPackages || []).forEach((pkg, idx) => {
      console.log(`   ${idx + 1}. ${pkg.name} - ${pkg.points} 點`);
    });

    console.log('\n✨ Data ready for use in /admin/settings/pricing\n');
  } catch (error) {
    console.error('❌ Error merging pricing data:', error.message);
    console.error('\nTroubleshooting:');
    console.error('  1. Check AWS credentials in .env.local');
    console.error('  2. Verify table exists: ' + PRICING_TABLE);
    console.error('  3. Ensure IAM permissions include GetItem/PutItem');
    process.exit(1);
  }
}

// Run the merge
mergePricingData();
