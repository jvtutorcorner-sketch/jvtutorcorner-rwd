#!/usr/bin/env node
/**
 * Initialize pricing data in DynamoDB
 * Usage: npm run script -- init-pricing-data.mjs
 *        node scripts/init-pricing-data.mjs
 */

import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const PRICING_TABLE = process.env.DYNAMODB_TABLE_PRICING || 'jvtutorcorner-pricing';
const AWS_REGION = process.env.AWS_REGION || 'ap-northeast-1';

console.log(`📊 Initializing Pricing Data`);
console.log(`   Table: ${PRICING_TABLE}`);
console.log(`   Region: ${AWS_REGION}\n`);

// Create DynamoDB client
const dynamoClient = new DynamoDBClient({ region: AWS_REGION });
const ddbDocClient = DynamoDBDocumentClient.from(dynamoClient);

// Sample pricing data
const pricingData = {
  id: 'pricing-config',
  pageTitle: '方案與價格',
  pageDescription: '選擇最適合您的會員方案',
  mode: 'subscription',
  updatedAt: new Date().toISOString(),
  plans: [
    {
      id: 'viewer',
      label: '新辦帳戶',
      targetAudience: '還在探索的新用戶',
      includedFeatures: '存取基礎課程內容',
      features: ['課程瀏覽', '基礎視頻', '社群互動'],
      priceHint: 'FREE',
      isActive: true,
      order: 1
    },
    {
      id: 'basic',
      label: 'Basic 普通會員',
      targetAudience: '一般學習者',
      includedFeatures: '全部課程 + 課程筆記 + 討論區',
      features: ['全部課程', '課程筆記', '討論區', '離線下載'],
      priceHint: '$9.99/月',
      badge: '推薦',
      isActive: true,
      order: 2
    },
    {
      id: 'pro',
      label: 'Pro 中級會員',
      targetAudience: '認真進修者',
      includedFeatures: '高級內容 + 一對一諮詢 + 優先支持',
      features: [
        '所有基礎功能',
        '高級課程內容',
        '一對一諮詢 (月 1 次)',
        '優先郵件支持',
        '證書下載'
      ],
      priceHint: '$19.99/月',
      isActive: true,
      order: 3
    },
    {
      id: 'elite',
      label: 'Elite 高級會員',
      targetAudience: '專業人士 / 企業用戶',
      includedFeatures: '所有功能 + VIP支持 + 專業認證',
      features: [
        '所有 Pro 功能',
        'VIP 24/7 支持',
        '無限一對一諮詢',
        '專業認證課程',
        '優先訪問新課程',
        '企業授權'
      ],
      priceHint: '$49.99/月',
      badge: '最受歡迎',
      isActive: true,
      order: 4
    }
  ],
  pointPackages: [
    {
      id: 'starter',
      name: '入門包',
      points: 100,
      price: 4.99,
      bonus: 10,
      description: '適合初試者體驗點數系統',
      isActive: true,
      order: 1
    },
    {
      id: 'standard',
      name: '標準包',
      points: 500,
      price: 19.99,
      bonus: 75,
      description: '最受歡迎的組合',
      badge: '推薦',
      isActive: true,
      order: 2
    },
    {
      id: 'premium',
      name: '高級包',
      points: 1500,
      price: 49.99,
      bonus: 300,
      description: '最划算的選擇，享受額外贈送',
      isActive: true,
      order: 3
    },
    {
      id: 'vip',
      name: 'VIP 終身包',
      points: 5000,
      price: 149.99,
      bonus: 1500,
      description: '一次購買，永久享受點數福利',
      badge: '超划算',
      isActive: true,
      order: 4
    }
  ]
};

async function initPricingData() {
  try {
    console.log('💾 Writing pricing data to DynamoDB...\n');

    const command = new PutCommand({
      TableName: PRICING_TABLE,
      Item: pricingData
    });

    await ddbDocClient.send(command);

    console.log('✅ Successfully initialized pricing data!\n');
    console.log('📋 Data written:\n');
    console.log(`   Page Title: ${pricingData.pageTitle}`);
    console.log(`   Plans: ${pricingData.plans.length} items`);
    console.log(`   Point Packages: ${pricingData.pointPackages.length} items`);
    console.log(`   Mode: ${pricingData.mode}`);
    console.log(`   Updated: ${pricingData.updatedAt}\n`);

    console.log('📊 Plans:');
    pricingData.plans.forEach((plan, idx) => {
      console.log(`   ${idx + 1}. ${plan.label} (${plan.priceHint})`);
    });

    console.log('\n💰 Point Packages:');
    pricingData.pointPackages.forEach((pkg, idx) => {
      console.log(`   ${idx + 1}. ${pkg.name} - ${pkg.points} 點 (NT$${pkg.price})`);
    });

    console.log('\n✨ Ready to use in admin panel at /admin/settings/pricing\n');
  } catch (error) {
    console.error('❌ Error initializing pricing data:', error.message);
    console.error('\nTroubleshooting:');
    console.error('  1. Check AWS credentials in .env.local');
    console.error('  2. Verify table exists: ' + PRICING_TABLE);
    console.error('  3. Ensure IAM permissions include PutItem on DynamoDB');
    process.exit(1);
  }
}

// Run the initialization
initPricingData();
